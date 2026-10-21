# Açılış süresi ölçümü (M10 T5)

**Soru:** Render'ın ücretsiz kabı uyuduktan sonra ilk istek 100–150 sn bekliyor (log'da "Started TekpasApplication in 75–83 s"). Bu sürenin ne kadarı bizim elimizde ve neyle kısalır?

**Kısa cevap:**
- Zamanın büyük kısmı Spring, Hibernate ve sınıf yüklemenin 0,1 CPU'da ağır çalışmasına gidiyor. Uygulamaya özgü ağır bir bean yok.
- Ölçülen tek somut kazanç: `@Query` metinlerinin açılışta ANTLR ile ayrıştırılmasını kapatmak. İlk cevap 162 sn'den 141 sn'ye iniyor (**-%13**), bütün testler geçiyor.
- Lazy init cevap süresini kısaltmıyor, işi yalnızca ilk isteğe kaydırıyor. Flyway doğrulaması 0,6 sn, hedef değil.
- **Prod'a bir şey uygulanmadı** (plan: yalnızca kullanıcı onayıyla). Öneriler §4'te.

## 1. Yöntem

- **İmaj:** Render'daki imajın aynısı (`backend/Dockerfile`: JRE 21 Alpine, uygulama CDS arşivi, yalnızca C1, SerialGC, %75 heap), yerelde derlendi.
- **Sınırlar:** Docker ile `--cpus=0.1 --memory=512m`, yani Render free'nin sınırları. Yerel 0,1 CPU, Render'dan yaklaşık 2 kat yavaş çıktı (Render'da 75–83 sn, burada 145–152 sn). Mutlak sayılar değil oranlar önemli.
- **Veritabanı:** yerel Postgres 16, TLS açık (`sslmode=require`; prod profili TLS'siz bağlantıyı reddediyor). Neon'un uyanma ve ağ gecikmesi yok.
- **Ölçülen iki sayı:**
  - **İlk cevap:** konteynerin başlatılmasından `/actuator/health`'in ilk 200'üne kadar (kullanıcının beklediği süre).
  - **Spring'in kendi satırı:** "Started TekpasApplication in X s".
- **Örnekleme:** zamanın nereye gittiğini görmek için açılış sırasında 3 sn'de bir SIGQUIT ile iş parçacığı dökümü alındı (49 örnek) ve ana iş parçacığının yığınları gruplandı. Ek araç gerekmedi.

## 2. Sonuçlar

| Koşu | İlk cevap | "Started … in" | Not |
| --- | --- | --- | --- |
| İlk açılış (17 migration uygulanıyor) | 170,0 sn | 155,4 sn | Flyway uygulama 3,6 sn |
| Temel (4 koşu) | 159,1 / 161,4 / 165,5 / 162,0 → **ort. 162 sn** | ort. 147 sn | Flyway doğrulama 0,6 sn |
| Lazy init (`SPRING_MAIN_LAZY_INITIALIZATION=true`) | 163,3 sn | 133,0 sn | "Started" erken, **ilk cevap aynı** |
| CDS arşivi olmadan | 231,2 sn | 211,4 sn | Mevcut CDS **-%30** kazandırıyor |
| **Regex sorgu işleyicisi** (2 koşu) | 140,3 / 141,9 → **ort. 141 sn** | ort. 125 sn | **-21 sn, -%13** |

**Aşamalar (temel koşu):**

| Aşama | Süre |
| --- | --- |
| JVM ve Spring Boot başlangıcı | ~5 sn |
| Bean tanımları ve auto-config koşulları | ~37 sn |
| Bağlantı havuzu (TLS) + Flyway | ~9 sn (Flyway doğrulama 0,6 sn) |
| Hibernate EntityManagerFactory | ~19 sn |
| Repository'ler, Security, MVC, springdoc | ~63 sn |
| "Started"dan ilk 200'e (DispatcherServlet, ilk istek) | ~14 sn |

**Son büyük aşamadaki 19 örnek:**
- **6'sı ANTLR'da.** Spring Data JPA'nın kendi HQL ayrıştırıcısı (`JpaQueryEnhancer`) 24 `@Query` metnini açılışta ayrıştırıyor. Sıralama eklemek ve sayma sorgusu türetmek için yapıyor, ama ilk ayrıştırma (ANTLR'ın önbelleği boşken) 0,1 CPU'da çok pahalı.
- **Geri kalanı dağınık:** Spring Security filtre zinciri, MVC argüman çözücüleri, springdoc'un model dönüştürücüleri, anotasyon tarama. Tek başına hedef alınacak bir şey yok.
- **Genel tablo:** 49 örneğin 13'ü sınıf yükleme ve yansımada. CDS eğitim koşusu veritabanı olmadan yapıldığı için Flyway, JDBC ve Hibernate'in veritabanına dokunan sınıfları arşivde yok.

## 3. Ne işe yaramaz

- **Lazy init:** "Started" 15 sn erken yazılıyor, ama ilk istek bean'leri o anda oluşturduğu için kullanıcı aynı süreyi bekliyor (163 sn ve 162 sn). Ayrıca yapılandırma hataları açılışta değil ilk istekte çıkar. **Önerilmez.**
- **Flyway doğrulamasını kapatmak (`validate-on-migrate=false`):** 0,6 sn kazandırır, migration'ların değiştirilmediği güvencesini kaldırır. **Önerilmez.**
- **Yalnızca C1 / SerialGC / CDS:** zaten açık (`Dockerfile`).

## 4. Öneriler (karar kullanıcının)

1. **Regex sorgu işleyicisi (önerilir, -%13):**
   - `@EnableJpaRepositories(queryEnhancerSelector = …)` ile `@Query` metinleri için `QueryEnhancerFactories.fallback()` seçilir. Yaklaşık 20 satırlık bir yapılandırma sınıfı; `exp/query-enhancer` dalında hazır, merge edilmedi.
   - **Bedeli:** sıralama ve sayma sorgusu türetme ANTLR yerine düzenli ifadelerle yapılır. Sayfalı iki sorgunun ikisi de kendi `countQuery`'sini veriyor; sıralama alanları `PageQuery` ile beyaz listede.
   - **Güvence:** bu ayarla bütün backend testleri koşuldu: 654 test, hepsi yeşil.
   - **Etki:** Render'da tahminen 8–10 sn.
2. **Java 25 ve AOT önbelleği (araştırılmalı):**
   - JDK 24'te gelen AOT önbelleği (JEP 483), sınıfları yüklenmiş ve bağlanmış hâlde saklar. JDK 25'te yöntem profilleri de eklendi (JEP 515).
   - JEP 483, Spring PetClinic'te JDK 23'e göre açılışı %42 kısalttığını bildiriyor. Bizde uygulama CDS'i zaten olduğu için ek kazanç bundan küçük olur ve ölçülmesi gerekir.
   - **Bedeli:** JDK sürüm yükseltmesi (21 → 25 LTS). Eğitim koşusunun veritabanı olmadan da çalışması gerekir (bugünkü CDS eğitimi gibi).
3. **Demo günü için asıl çözüm uyutmamak:** cron'u 7/24'e almak (`docs/m10-plan.md` §5 madde 5). Yukarıdakilerin hiçbiri 100 sn'lik soğuk açılışı birkaç saniyeye indirmez. Uyanık sunucu 1 sn'nin altında cevap veriyor.

**Ölçülmeyenler:**
- Neon'un uyanma süresi.
- Render'ın imajı çekme ve kabı başlatma süresi. Bunlar 75–83 sn ile 100–150 sn arasındaki farkın kaynağı ve bizim elimizde değil.
- Uyuyan sunucuda erken kesilen bir isteğin uyanmayı iptal edip etmediği: canlıda bakılmalı (PLAN M10 notu).
