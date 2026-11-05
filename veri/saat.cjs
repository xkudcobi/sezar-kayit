// Sabit saat: demo sunucusu (Node) bu dosyayı NODE_OPTIONS=--require ile yükler.
// SEZAR_SAAT_KAYMA (ms) kadar kaydırılmış bir Date kullanılır; saat akmaya devam eder ama hep
// aynı noktadan başlar. Tarayıcı tarafına da aynı kayma motor/calistir.mjs ile verilir,
// böylece sunucu ve sayfa aynı "şimdi"yi görür.
const kayma = Number(process.env.SEZAR_SAAT_KAYMA || 0);
if (kayma) {
  const Gercek = Date;
  function SabitDate(...a) {
    if (!new.target) return new Gercek(Gercek.now() + kayma).toString();
    return a.length ? new Gercek(...a) : new Gercek(Gercek.now() + kayma);
  }
  SabitDate.prototype = Gercek.prototype;
  SabitDate.now = () => Gercek.now() + kayma;
  SabitDate.parse = Gercek.parse;
  SabitDate.UTC = Gercek.UTC;
  globalThis.Date = SabitDate;
}
