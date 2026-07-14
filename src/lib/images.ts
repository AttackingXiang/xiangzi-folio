type ImageLimits = {
  maxWidth: number;
  maxHeight: number;
  maxBytes: number;
};

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("图片读取失败"));
    reader.readAsDataURL(blob);
  });
}

export async function prepareLocalImage(file: File, limits: ImageLimits): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("请选择有效的图片文件");
  if (file.size > 12 * 1024 * 1024) throw new Error("图片不能超过 12MB");
  if (typeof createImageBitmap !== "function") {
    if (file.size > limits.maxBytes) throw new Error("图片过大，请先压缩后再上传");
    return blobToDataUrl(file);
  }

  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, limits.maxWidth / bitmap.width, limits.maxHeight / bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext("2d");
  if (!context) { bitmap.close(); throw new Error("浏览器无法处理这张图片"); }
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  const encode = (quality: number) => new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("图片压缩失败")), "image/webp", quality));
  let output = await encode(.86);
  if (output.size > limits.maxBytes) output = await encode(.68);
  if (output.size > limits.maxBytes) throw new Error(`压缩后仍超过 ${Math.round(limits.maxBytes / 1024)}KB，请换一张图片`);
  return blobToDataUrl(output);
}
