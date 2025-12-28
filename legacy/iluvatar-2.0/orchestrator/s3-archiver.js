/**
 * ILUVATAR 3.0 - S3 Archiver
 *
 * Archives completed hackathon projects to S3.
 * Stores code, logs, workflows, and metadata.
 */

const AWS = require('aws-sdk');
const archiver = require('archiver');
const { PassThrough } = require('stream');
const path = require('path');

class S3Archiver {
  constructor(options = {}) {
    this.bucket = options.bucket || process.env.S3_ARCHIVE_BUCKET || 'iluvatar-archives';
    this.region = options.region || process.env.AWS_REGION || 'us-east-1';

    this.s3 = new AWS.S3({
      region: this.region,
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    });
  }

  /**
   * Archive a hackathon
   */
  async archive(data) {
    const {
      hackathonId,
      hackathon,
      finalState,
      budget,
      containerData,
      archivedAt
    } = data;

    console.log(`  Archiving hackathon ${hackathonId} to S3...`);

    const archiveKey = `hackathons/${hackathonId}/${archivedAt.replace(/:/g, '-')}.zip`;

    // Create archive
    const archive = archiver('zip', { zlib: { level: 9 } });
    const passThrough = new PassThrough();

    // Track errors from both streams
    let archiveError = null;
    let passThroughError = null;

    // Set up error handlers BEFORE piping
    archive.on('error', (err) => {
      archiveError = err;
      console.error(`  Archive stream error for ${hackathonId}:`, err.message);
      // Destroy the passThrough to propagate the error
      passThrough.destroy(err);
    });

    archive.on('warning', (err) => {
      if (err.code === 'ENOENT') {
        console.warn(`  Archive warning for ${hackathonId}:`, err.message);
      } else {
        // Treat other warnings as errors
        archiveError = err;
        passThrough.destroy(err);
      }
    });

    passThrough.on('error', (err) => {
      passThroughError = err;
      console.error(`  PassThrough stream error for ${hackathonId}:`, err.message);
    });

    // Now pipe after handlers are set up
    archive.pipe(passThrough);

    // Add metadata
    archive.append(JSON.stringify({
      hackathon,
      finalState,
      budget,
      archivedAt,
      version: '3.0.0'
    }, null, 2), { name: 'metadata.json' });

    // Add code archive if available
    if (containerData?.code) {
      archive.append(containerData.code, { name: 'code.tar.gz' });
    }

    // Add logs
    if (containerData?.logs) {
      archive.append(containerData.logs, { name: 'logs.txt' });
    }

    // Add workflow data
    if (containerData?.workflows) {
      archive.append(containerData.workflows, { name: 'workflows.sqlite' });
    }

    // Finalize archive
    archive.finalize();

    // Check for errors before upload
    if (archiveError) {
      throw new Error(`Archive creation failed: ${archiveError.message}`);
    }

    // Upload to S3
    const uploadParams = {
      Bucket: this.bucket,
      Key: archiveKey,
      Body: passThrough,
      ContentType: 'application/zip',
      Metadata: {
        'hackathon-id': hackathonId,
        'hackathon-name': hackathon.name || 'unknown',
        'archived-at': archivedAt
      }
    };

    try {
      await this.s3.upload(uploadParams).promise();
    } catch (uploadError) {
      // Check if the error was caused by stream issues
      if (archiveError) {
        throw new Error(`Archive failed (stream error): ${archiveError.message}`);
      }
      if (passThroughError) {
        throw new Error(`Archive failed (passthrough error): ${passThroughError.message}`);
      }
      throw new Error(`S3 upload failed: ${uploadError.message}`);
    }

    // Generate signed URL for access
    const url = await this.getSignedUrl(archiveKey, 7 * 24 * 60 * 60);  // 7 days

    console.log(`  ✓ Archived to s3://${this.bucket}/${archiveKey}`);

    return {
      bucket: this.bucket,
      key: archiveKey,
      url,
      size: archive.pointer()
    };
  }

  /**
   * Get signed URL for archive access
   */
  async getSignedUrl(key, expiresIn = 3600) {
    return this.s3.getSignedUrlPromise('getObject', {
      Bucket: this.bucket,
      Key: key,
      Expires: expiresIn
    });
  }

  /**
   * List archives for a hackathon
   */
  async listArchives(hackathonId) {
    const response = await this.s3.listObjectsV2({
      Bucket: this.bucket,
      Prefix: `hackathons/${hackathonId}/`
    }).promise();

    return response.Contents.map(obj => ({
      key: obj.Key,
      size: obj.Size,
      lastModified: obj.LastModified
    }));
  }

  /**
   * Download archive
   */
  async downloadArchive(key) {
    const response = await this.s3.getObject({
      Bucket: this.bucket,
      Key: key
    }).promise();

    return response.Body;
  }

  /**
   * Delete archive
   */
  async deleteArchive(key) {
    await this.s3.deleteObject({
      Bucket: this.bucket,
      Key: key
    }).promise();

    return { deleted: true, key };
  }

  /**
   * Get archive metadata
   */
  async getArchiveMetadata(key) {
    const response = await this.s3.headObject({
      Bucket: this.bucket,
      Key: key
    }).promise();

    return {
      size: response.ContentLength,
      lastModified: response.LastModified,
      metadata: response.Metadata
    };
  }

  /**
   * Upload file to S3
   */
  async uploadFile(key, body, options = {}) {
    const params = {
      Bucket: this.bucket,
      Key: key,
      Body: body,
      ContentType: options.contentType || 'application/octet-stream',
      Metadata: options.metadata || {}
    };

    const result = await this.s3.upload(params).promise();

    return {
      key,
      location: result.Location
    };
  }

  /**
   * Check if bucket exists and is accessible
   */
  async healthCheck() {
    try {
      await this.s3.headBucket({ Bucket: this.bucket }).promise();
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Create bucket if it doesn't exist
   */
  async ensureBucket() {
    try {
      await this.s3.headBucket({ Bucket: this.bucket }).promise();
    } catch (error) {
      if (error.code === 'NotFound') {
        await this.s3.createBucket({
          Bucket: this.bucket,
          CreateBucketConfiguration: {
            LocationConstraint: this.region
          }
        }).promise();

        // Enable versioning
        await this.s3.putBucketVersioning({
          Bucket: this.bucket,
          VersioningConfiguration: { Status: 'Enabled' }
        }).promise();
      } else {
        throw error;
      }
    }
  }

  /**
   * Get storage statistics
   */
  async getStorageStats() {
    const response = await this.s3.listObjectsV2({
      Bucket: this.bucket
    }).promise();

    let totalSize = 0;
    let fileCount = 0;
    const byHackathon = {};

    for (const obj of response.Contents || []) {
      totalSize += obj.Size;
      fileCount++;

      // Extract hackathon ID from key
      const match = obj.Key.match(/^hackathons\/([^/]+)\//);
      if (match) {
        const hackathonId = match[1];
        if (!byHackathon[hackathonId]) {
          byHackathon[hackathonId] = { size: 0, count: 0 };
        }
        byHackathon[hackathonId].size += obj.Size;
        byHackathon[hackathonId].count++;
      }
    }

    return {
      total_size: totalSize,
      total_size_formatted: this.formatBytes(totalSize),
      file_count: fileCount,
      by_hackathon: byHackathon
    };
  }

  /**
   * Format bytes to human readable
   */
  formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}

module.exports = { S3Archiver };
