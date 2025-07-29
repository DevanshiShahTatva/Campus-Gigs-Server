import { Injectable } from '@nestjs/common';
import { v2 as cloudinary } from 'cloudinary';
import { Readable } from 'stream';

@Injectable()
export class CloudinaryService {
  constructor() {}

  async uploadFromBuffer(
    folderName: string,
    file: Express.Multer.File,
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!file?.buffer) {
        return reject(new Error('Invalid file buffer'));
      }

      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: folderName,
          resource_type: 'image',
          // allowed_formats: ["jpg", "jpeg", "png", "webp"],
          // resource_type: "auto"
        },
        (error, result) => {
          if (error) {
            console.error('Cloudinary upload error:', error);
            return reject(error);
          }

          if (!result?.secure_url || !result?.public_id) {
            return reject(new Error('Cloudinary upload failed'));
          }
          resolve({
            url: result.secure_url,
            imageId: result.public_id,
          });
        },
      );

      // Pipe buffer to stream
      const readableStream = new Readable();
      readableStream.push(file.buffer);
      readableStream.push(null);
      readableStream.pipe(uploadStream);
    });
  }

  async saveFileToCloud(
    folderName: string,
    file: Express.Multer.File,
  ): Promise<{ url: string; imageId: string }> {
    try {
      return await this.uploadFromBuffer(folderName, file);
    } catch (error) {
      console.error('File upload failed:', error);
      throw new Error(
        `File upload failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  async deleteFromCloudinary(publicId: string): Promise<void> {
    try {
      const result = await cloudinary.uploader.destroy(publicId);
      if (result.result !== 'ok') {
        throw new Error(`Failed to delete asset: ${publicId}`);
      }
    } catch (error) {
      console.error('Cloudinary deletion error:', error);
      throw new Error(`Failed to delete asset: ${publicId}`);
    }
  }

  extractPublicIdFromUrl(url: string): string | null {
    try {
      const urlParts = url.split('/');
      const lastSegment = urlParts[urlParts.length - 1];
      const secondLastSegment = urlParts[urlParts.length - 2];
      const [publicId] = lastSegment.split('.');
      return `${secondLastSegment}/${publicId}`;
    } catch (error) {
      console.error('Error extracting public ID:', error);
      return null;
    }
  }
}
