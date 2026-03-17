export interface ImageResult {
  uri: string;
  width: number;
  height: number;
  mime: string;
  base64?: string;
  size?: number;
}

export interface ImagePickerOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number; // 0–1
  includeBase64?: boolean;
}

export interface IImagePicker {
  pickFromGallery(options?: ImagePickerOptions): Promise<ImageResult | null>;
  pickFromCamera(options?: ImagePickerOptions): Promise<ImageResult | null>;
  crop(uri: string, options?: ImagePickerOptions): Promise<ImageResult | null>;
  compress(uri: string, quality: number): Promise<ImageResult | null>;
}
