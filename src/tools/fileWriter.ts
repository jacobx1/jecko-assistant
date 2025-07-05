import fs from 'fs/promises';
import path from 'path';
import { WriteFileParamsSchema, type WriteFileParams } from '../schemas/tools.js';

export class FileWriterTool {
  constructor() {}

  async execute(params: WriteFileParams): Promise<string> {
    try {
      // Validate input parameters
      const validatedParams = WriteFileParamsSchema.parse(params);
      
      const { filename, content, directory } = validatedParams;
      
      // Validate filename for security
      this.validateFilename(filename);
      
      // Ensure directory exists
      try {
        await fs.access(directory);
      } catch {
        // Directory doesn't exist, create it
        await fs.mkdir(directory, { recursive: true });
      }
      
      // Generate the full file path
      let fullPath = path.join(directory, filename);
      
      // Check if file exists and handle collision
      try {
        await fs.access(fullPath);
        // File exists, generate unique filename
        const parsedPath = path.parse(filename);
        const uniqueFilename = `${parsedPath.name}_${Date.now()}${parsedPath.ext}`;
        fullPath = path.join(directory, uniqueFilename);
      } catch {
        // File doesn't exist, use original path
      }
      
      // Validate that we're not trying to write outside allowed directories
      const resolvedPath = path.resolve(fullPath);
      const resolvedDirectory = path.resolve(directory);
      
      if (!resolvedPath.startsWith(resolvedDirectory)) {
        throw new Error('Cannot write files outside the specified directory');
      }
      
      // Write the file
      await fs.writeFile(fullPath, content, 'utf8');
      
      // Get file stats for confirmation
      const stats = await fs.stat(fullPath);
      const relativePath = path.relative(process.cwd(), fullPath);
      
      return `**File written successfully:**
- **Path:** ${relativePath}
- **Size:** ${stats.size} bytes
- **Created:** ${new Date().toISOString()}

The file has been saved with the specified content.`;

    } catch (error) {
      if (error instanceof z.ZodError) {
        const issues = error.issues.map(issue => issue.message).join(', ');
        throw new Error(`Invalid file writing parameters: ${issues}`);
      }
      
      if (error instanceof Error) {
        // Handle specific filesystem errors
        if (error.code === 'EACCES') {
          throw new Error('Permission denied: Cannot write to the specified location');
        }
        if (error.code === 'ENOENT') {
          throw new Error('Directory does not exist and could not be created');
        }
        if (error.code === 'ENOSPC') {
          throw new Error('No space left on device');
        }
        if (error.code === 'EMFILE' || error.code === 'ENFILE') {
          throw new Error('Too many open files');
        }
      }
      
      throw new Error(`File writing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
  
  /**
   * Helper method to validate filename for security
   */
  private validateFilename(filename: string): void {
    // Check for path traversal attempts
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      throw new Error('Filename cannot contain path separators or parent directory references');
    }
    
    // Check for reserved names on Windows
    const reservedNames = ['CON', 'PRN', 'AUX', 'NUL', 'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9', 'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9'];
    const nameWithoutExt = path.parse(filename).name.toUpperCase();
    if (reservedNames.includes(nameWithoutExt)) {
      throw new Error(`Filename cannot be a reserved system name: ${nameWithoutExt}`);
    }
    
    // Check for invalid characters
    const invalidChars = /[<>:"|?*\x00-\x1f]/;
    if (invalidChars.test(filename)) {
      throw new Error('Filename contains invalid characters');
    }
  }
}