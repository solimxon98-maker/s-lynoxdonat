/**
 * Chek rasmini serverga yuborishdan oldin kichraytirish (max 1600px, JPEG).
 * Telefon skrinshotlari 3–8 MB bo'ladi — bu 200–600 KB gacha tushiradi.
 */
export async function compressImage(file: File, maxSide = 1600): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("Faqat rasm yuklash mumkin (JPG/PNG).");
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("Rasmni ochib bo‘lmadi. Boshqa rasm tanlang."));
      i.src = url;
    });
    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Rasmni tayyorlab bo‘lmadi");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    let q = 0.85;
    let data = canvas.toDataURL("image/jpeg", q);
    while (data.length > 2_500_000 && q > 0.4) {
      q -= 0.15;
      data = canvas.toDataURL("image/jpeg", q);
    }
    return data;
  } finally {
    URL.revokeObjectURL(url);
  }
}
