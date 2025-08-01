const sharp = require('sharp');
const fs = require('fs').promises;
const path = require('path');

class ThumbnailService {
  constructor() {
    this.thumbnailSize = { width: 200, height: 200 };
    this.thumbnailDir = './uploads/thumbnails';
  }

  async generateThumbnail(fileUrl, fileExtension) {
    try {
      // Ensure thumbnail directory exists
      await fs.mkdir(this.thumbnailDir, { recursive: true });

      const fileName = path.basename(fileUrl);
      const nameWithoutExt = path.parse(fileName).name;
      const thumbnailPath = path.join(this.thumbnailDir, `thumb_${nameWithoutExt}.jpg`);

      if (fileExtension === '.pdf') {
        return await this.generatePdfThumbnail(fileUrl, thumbnailPath);
      } else if (['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(fileExtension)) {
        return await this.generateImageThumbnail(fileUrl, thumbnailPath);
      } else {
        console.warn(`[THUMBNAIL] Unsupported file type for thumbnail: ${fileExtension}`);
        return null;
      }

    } catch (error) {
      console.error('[THUMBNAIL] Generation failed:', error);
      return null;
    }
  }

  async generateImageThumbnail(imageUrl, thumbnailPath) {
    try {
      await sharp(imageUrl)
        .resize(this.thumbnailSize.width, this.thumbnailSize.height, {
          fit: 'cover',
          position: 'center'
        })
        .jpeg({ quality: 80 })
        .toFile(thumbnailPath);

      console.log(`[THUMBNAIL] Image thumbnail created: ${thumbnailPath}`);
      return thumbnailPath;

    } catch (error) {
      console.error('[THUMBNAIL] Image processing failed:', error);
      throw error;
    }
  }

  async generatePdfThumbnail(pdfUrl, thumbnailPath) {
    try {
      // For PDF thumbnails, we'll use a simple approach in Phase 1
      // This requires pdf-poppler or similar library for production
      // For now, we'll create a placeholder approach

      console.warn('[THUMBNAIL] PDF thumbnail generation not implemented in Phase 1');
      
      // Create a simple placeholder thumbnail for PDFs
      const placeholderSvg = `
        <svg width="200" height="200" xmlns="http://www.w3.org/2000/svg">
          <rect width="200" height="200" fill="#f8f9fa" stroke="#dee2e6" stroke-width="2"/>
          <text x="100" y="90" text-anchor="middle" font-family="Arial" font-size="14" fill="#6c757d">PDF</text>
          <text x="100" y="110" text-anchor="middle" font-family="Arial" font-size="12" fill="#6c757d">Document</text>
          <text x="100" y="130" text-anchor="middle" font-family="Arial" font-size="10" fill="#adb5bd">Click to view</text>
        </svg>
      `;

      // Convert SVG to JPEG using Sharp
      await sharp(Buffer.from(placeholderSvg))
        .resize(this.thumbnailSize.width, this.thumbnailSize.height)
        .jpeg({ quality: 80 })
        .toFile(thumbnailPath);

      console.log(`[THUMBNAIL] PDF placeholder thumbnail created: ${thumbnailPath}`);
      return thumbnailPath;

    } catch (error) {
      console.error('[THUMBNAIL] PDF thumbnail failed:', error);
      throw error;
    }
  }

  async cleanup(thumbnailPath) {
    try {
      if (thumbnailPath) {
        await fs.unlink(thumbnailPath);
        console.log(`[THUMBNAIL] Cleaned up: ${thumbnailPath}`);
      }
    } catch (error) {
      console.warn('[THUMBNAIL] Cleanup failed:', error);
    }
  }

  getThumbnailUrl(thumbnailPath) {
    if (!thumbnailPath) return null;
    
    // Convert local path to URL path
    return thumbnailPath.replace('./uploads/', '/uploads/');
  }
}

module.exports = new ThumbnailService();