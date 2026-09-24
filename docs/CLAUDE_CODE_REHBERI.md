# Claude Code ile çalışma rehberi

## İlk kurulum (bir kez)
1. GitHub'da boş `tekpas` reposu aç, bu klasörü içine koy, ilk commit'i at.
2. Terminalde repo kökünde `claude` çalıştır. Claude Code kökteki ve alt klasörlerdeki `CLAUDE.md` dosyalarını otomatik okur.
3. İlk mesajın: *"CLAUDE.md ve docs/PLAN.md'yi oku, anladıklarını 10 maddede özetle, M1 için görev listesi çıkar. Kod yazma."* Özet yanlışsa burada düzelt. Sonradan düzeltmek daha pahalıya gelir.

## Döngü
1. Planlama sohbetinden (Claude) sıradaki görevin prompt'unu al.
2. Claude Code'a ver. Önce **plan modunda** (Shift+Tab) planını göster, onayla, sonra uygulasın.
3. Test + lint yeşil mi kontrol et, çalışan uygulamayı kendin bir kez dene.
4. PR'ı Claude Code'a açtır.
5. Merge için Claude Code'a açıkça *"merge et"* de. CI yeşilse `gh pr merge --squash --delete-branch` ile squash merge eder (commit mesajı = PR başlığı, Conventional Commits), sonra `main`'e geçip pull eder. CI kırmızıysa merge etmez, sebebini raporlar.
6. Takıldığın, emin olmadığın ya da beğenmediğin yeri planlama sohbetine getir.
7. Kilometre taşı bitince: *"M_ bitti, docs/haftalik notunu yaz ve PLAN.md'yi işaretle."*

## İyi bir görev prompt'unun şablonu

```
Görev: <tek cümle, ne yapılacak>
Kilometre taşı: M_  (docs/PLAN.md §5)

Bağlam:
- <ilgili tablolar, endpoint'ler, önceki iş>

Yapılacaklar:
1. ...
2. ...

Kabul kriterleri:
- <gözle doğrulanabilir sonuç>
- Testler: <hangi senaryolar, tenant izolasyonu dahil>

Kapsam dışı:
- <bu görevde dokunulmayacaklar>

Önce plan çıkar ve bana göster. Onaylamadan kod yazma.
```

## Altın kurallar
- **Bir prompt = bir PR.** "M1'in hepsini yap" deme. Görevi yarım günlük parçalara böl.
- **Kodu oku.** Anlamadığın satırı sor. Jüride "bunu AI yazdı, bilmiyorum" diyemezsin.
- **Kırmızı testle devam etme.** Önce düzelt.
- **Bağlam dolunca `/clear`.** Uzun oturumlarda kalite düşer. Kalıcı bilgiler zaten `CLAUDE.md` ve `docs/` içinde.
- **Kural değişirse `CLAUDE.md`'yi güncelle.** Aynı hatayı iki kez düzeltiyorsan kural eksik demektir.
