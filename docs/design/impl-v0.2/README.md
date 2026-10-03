# Tasarım v0.2 karşılaştırması (tarihçe, dondurulmuş)

Bu klasördeki görüntüler Claude Design v0.2 ile uygulamanın onaylanan yan yana karşılaştırmasıdır: login (masaüstü ve mobil; varsayılan, hata, yükleniyor) ve panel iskeleti (Partiler; masaüstü ve 390 px mobil: kapalı, menü, kullanıcı menüsü), açık ve koyu tema.

- Onaylandığı yer: PR #9 (login ve panel iskeleti, M1) ve PR #10 (mobil panel).
- `design-*.png` tasarımdan, `impl-*.png` uygulamadan.

**Dondurulmuştur.** Bu görüntüleri üreten `web/e2e/screenshots.spec.ts`, PR #15'te (M2, Partiler) kaldırıldı: Partiler sayfası artık v0.3 tasarımına (07) uyuyor, yeniden üretilseler v0.2 ile karşılaştırma bozulurdu. Görüntüler o günkü onayın kaydı olarak kalır, üzerine yazılmaz.

Güncel karşılaştırmalar: `docs/design/impl-v0.3/` (`web/e2e/screenshots-v03.spec.ts`). Eski üreticiye ihtiyaç olursa: `git show 404f8e2:web/e2e/screenshots.spec.ts`.
