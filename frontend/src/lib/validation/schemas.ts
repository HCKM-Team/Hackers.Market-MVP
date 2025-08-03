import { z } from "zod";

export const escrowSchema = z.object({
  title: z
    .string()
    .min(10, "Title must be at least 10 characters")
    .max(100, "Title must be less than 100 characters")
    .regex(/^[a-zA-Z0-9\s\-.,!?]+$/, "Title contains invalid characters"),

  description: z
    .string()
    .min(50, "Description must be at least 50 characters")
    .max(5000, "Description must be less than 5000 characters"),

  price: z
    .string()
    .regex(/^\d+\.?\d{0,18}$/, "Invalid price format")
    .refine((val) => parseFloat(val) > 0, "Price must be greater than 0")
    .refine((val) => parseFloat(val) < 1000000, "Price exceeds maximum limit"),

  currency: z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Invalid token address"),

  deliveryTime: z
    .number()
    .min(3600, "Delivery time must be at least 1 hour")
    .max(2592000, "Delivery time cannot exceed 30 days"),

  requiredKYC: z.enum(["none", "basic", "enhanced", "full"]),

  images: z
    .array(z.instanceof(File))
    .min(1, "At least one image is required")
    .max(10, "Maximum 10 images allowed")
    .refine(
      (files) => files.every((file) => file.size <= 5 * 1024 * 1024),
      "Each image must be less than 5MB"
    )
    .refine(
      (files) =>
        files.every((file) =>
          ["image/jpeg", "image/png", "image/webp"].includes(file.type)
        ),
      "Only JPEG, PNG, and WebP images are allowed"
    ),
});

export const panicCodeSchema = z
  .string()
  .min(8, "Panic code must be at least 8 characters")
  .regex(
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]+$/,
    "Panic code must contain uppercase, lowercase, number, and special character"
  );
