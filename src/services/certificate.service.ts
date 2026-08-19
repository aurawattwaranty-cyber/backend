import { buildTextPdf } from "../utils/pdf.js";
import { getWarrantyById } from "./warranties.service.js";

function buildVerificationUrl(warrantyId: string, origin: string): string {
  return `${origin.replace(/\/$/, "")}/verify/${encodeURIComponent(warrantyId)}`;
}

export async function getWarrantyCertificatePdf(
  warrantyId: string,
  origin: string,
): Promise<Buffer> {
  const registration = await getWarrantyById(warrantyId);
  const verificationUrl = buildVerificationUrl(registration.id, origin);
  const lines = [
    `Warranty ID: #${registration.id}`,
    `Serial Number: ${registration.serial}`,
    `Model: ${registration.modelName}`,
    `Customer: ${registration.customer.fullName}`,
    `Status: ${registration.status}`,
    `Coverage Start: ${registration.warrantyStart ?? "Pending approval"}`,
    `Coverage End: ${registration.warrantyEnd ?? "Pending approval"}`,
    `Verify: ${verificationUrl}`,
  ];
  return buildTextPdf(lines);
}
