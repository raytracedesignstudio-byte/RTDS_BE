import crypto from "node:crypto";

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} must be set`);
  }
  return value;
}

export function createCloudinaryUploadConfig() {
  const cloudName = requiredEnv("CLOUDINARY_CLOUD_NAME");
  const apiKey = requiredEnv("CLOUDINARY_API_KEY");
  const apiSecret = requiredEnv("CLOUDINARY_API_SECRET");
  const folder = process.env.CLOUDINARY_FOLDER || "raytrace";
  const timestamp = Math.floor(Date.now() / 1000).toString();

  const signature = crypto
    .createHash("sha1")
    .update(`folder=${folder}&timestamp=${timestamp}${apiSecret}`)
    .digest("hex");

  return {
    uploadURL: `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
    uploadParams: {
      api_key: apiKey,
      folder,
      timestamp,
      signature,
    },
  };
}
