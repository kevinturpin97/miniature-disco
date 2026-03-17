import type { IImagePicker, ImageResult, ImagePickerOptions } from '@core/abstractions/IImagePicker';

function pickFile(accept = 'image/*'): Promise<File | null> {
  return new Promise(resolve => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.click();
  });
}

async function fileToResult(file: File, opts?: ImagePickerOptions): Promise<ImageResult | null> {
  return new Promise(resolve => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const maxW = opts?.maxWidth ?? img.width;
      const maxH = opts?.maxHeight ?? img.height;
      const scale = Math.min(maxW / img.width, maxH / img.height, 1);
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d')?.drawImage(img, 0, 0, canvas.width, canvas.height);
      const quality = opts?.quality ?? 0.9;
      const base64 = opts?.includeBase64 ? canvas.toDataURL(file.type, quality).split(',')[1] : undefined;
      resolve({ uri: canvas.toDataURL(file.type, quality), width: canvas.width, height: canvas.height, mime: file.type, base64, size: file.size });
      URL.revokeObjectURL(url);
    };
    img.src = url;
  });
}

export const WebImagePicker: IImagePicker = {
  async pickFromGallery(options) {
    const file = await pickFile('image/*');
    return file ? fileToResult(file, options) : null;
  },
  async pickFromCamera(options) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.capture = 'environment';
    return new Promise(resolve => {
      input.onchange = () => {
        const file = input.files?.[0];
        resolve(file ? fileToResult(file, options) : null);
      };
      input.click();
    });
  },
  async crop(uri, options) {
    return { uri, width: options?.maxWidth ?? 800, height: options?.maxHeight ?? 600, mime: 'image/jpeg' };
  },
  async compress(uri, quality) {
    return { uri, width: 0, height: 0, mime: 'image/jpeg', size: 0 };
  },
};
