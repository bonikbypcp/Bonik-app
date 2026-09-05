// BONIK by PCP — Cloudinary image upload
//
// IMPORTANT: the API Secret must NEVER go in frontend code (it lets
// anyone re-upload/delete/manage your whole media library). For
// uploading straight from the phone browser, Cloudinary has a safer
// option called an "unsigned upload preset" — only the Cloud Name and
// a preset name are needed on the frontend, no secret required.
//
// One-time setup in Cloudinary (do this once):
//   1. Go to Settings (gear icon) → Upload
//   2. Scroll to "Upload presets" → click "Add upload preset"
//   3. Set "Signing Mode" to "Unsigned"
//   4. (Optional) set a folder name like "bonik-products" to keep things tidy
//   5. Save, then copy the preset's name and paste it below as UPLOAD_PRESET

const CLOUD_NAME = "ksfgqpgg";
const UPLOAD_PRESET = "bonik_unsigned";

export async function uploadImageToCloudinary(file) {
  const url = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`;

  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", UPLOAD_PRESET);

  const res = await fetch(url, { method: "POST", body: formData });
  if (!res.ok) throw new Error("Image upload failed");

  const data = await res.json();
  return data.secure_url; // this is what gets saved into products.photo_url etc.
}

// Example usage in a form:
//   const handlePhotoSelect = async (e) => {
//     const file = e.target.files[0];
//     const photoUrl = await uploadImageToCloudinary(file);
//     setForm((f) => ({ ...f, photoUrl }));
//   };
