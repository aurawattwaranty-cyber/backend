export type ProductType = "inverter" | "battery";

export interface ProductModel {
  id: string;
  series: string;
  name: string;
  capacityKw: number;
  productType: ProductType;
  warrantyMonths: number;
  active: boolean;
  createdAt: string;
}

export type SerialStatus = "available" | "registered";

export interface SerialNumber {
  id: string;
  serial: string;
  modelId: string;
  modelName: string;
  capacityKw: number;
  productType: ProductType;
  status: SerialStatus;
  addedAt: string;
  warrantyId?: string;
}

export type WarrantyStatus =
  | "pending"
  | "correction"
  | "active"
  | "rejected"
  | "expired";

export interface CustomerDetails {
  fullName: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
}

export interface InstallerDetails {
  companyName: string;
  contactName: string;
  contactNumber: string;
  email: string;
  installerId?: string;
}

export interface InstallationDetails {
  installationDate: string;
  installationAddress: string;
  productType: ProductType;
  modelId: string;
  modelName: string;
  capacityKw: number;
  batteryInstalled: boolean;
  batteryModel?: string;
  batterySerial?: string;
}

export interface WarrantyPhoto {
  requirementId: string;
  requirementLabel: string;
  fileName: string;
  url: string;
  sizeBytes: number;
  uploadedAt: string;
  storageId?: string;
}

export type WarrantyEventType =
  | "submitted"
  | "verified"
  | "correction"
  | "resubmitted"
  | "approved"
  | "activated"
  | "rejected"
  | "expired";

export interface WarrantyEvent {
  id: string;
  type: WarrantyEventType;
  label: string;
  note?: string;
  actor: string;
  at: string;
}

export interface WarrantyRegistration {
  id: string;
  serial: string;
  modelId: string;
  modelName: string;
  capacityKw: number;
  productType: ProductType;
  customer: CustomerDetails;
  installer: InstallerDetails;
  installation: InstallationDetails;
  photos: WarrantyPhoto[];
  status: WarrantyStatus;
  submittedAt: string;
  reviewedAt?: string;
  decisionNote?: string;
  correctionItems?: string[];
  warrantyStart?: string;
  warrantyEnd?: string;
  warrantyMonths?: number;
  history: WarrantyEvent[];
}

export interface PhotoRequirement {
  id: string;
  label: string;
  instructions: string;
  required: boolean;
  order: number;
}

export interface RegistrationDraft {
  serial: string;
  modelId: string;
  modelName: string;
  capacityKw: number;
  productType: ProductType;
  customer: CustomerDetails;
  installer: InstallerDetails;
  installation: InstallationDetails;
  photos: WarrantyPhoto[];
}

export interface SerialValidationResult {
  status: "available" | "registered" | "unknown";
  serial: SerialNumber | null;
  message: string;
  existingWarrantyId?: string;
}

/**
 * `superadmin` outranks `admin`: it owns the customer-experience configuration
 * on top of everything an admin can do. Guards treat it as a superset, so no
 * existing admin route needs to enumerate both.
 */
export type AdminRole = "superadmin" | "admin" | "verifier";

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: AdminRole;
}

/**
 * A stored admin account. `passwordHash` never leaves the service layer —
 * `toAdminUser` strips it before anything reaches a response.
 */
export interface AdminAccount extends AdminUser {
  passwordHash: string;
  active: boolean;
  createdAt: string;
  lastLoginAt?: string;
}

export interface CreateUserInput {
  name: string;
  email: string;
  password: string;
  role: AdminRole;
}

export interface ChangePasswordInput {
  currentPassword: string;
  newPassword: string;
}

export interface DashboardStats {
  totalRegistrations: number;
  pendingReview: number;
  activeWarranties: number;
  rejected: number;
  correctionRequired: number;
  serialsAvailable: number;
  serialsRegistered: number;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface BulkImportRow {
  rowNumber: number;
  serial: string;
  modelName: string;
  capacityKw: string;
  productType: string;
  valid: boolean;
  error?: string;
}

export interface BulkImportPreview {
  fileName: string;
  rows: BulkImportRow[];
  validCount: number;
  invalidCount: number;
}

export interface BulkImportResult {
  imported: number;
  failed: number;
  errors: { rowNumber: number; serial: string; error: string }[];
}

/* ------------------------------------------------------------------ *
 * Customer experience configuration
 *
 * The public Register Warranty form and Check Status page render from this
 * config rather than from hard-coded copy, so a super admin can relabel,
 * reorder, hide or require the fields a customer sees without a deploy.
 * ------------------------------------------------------------------ */

export type CustomerFieldSection = "customer" | "installer" | "installation";

export interface CustomerFieldConfig {
  /** Stable dotted path into the registration draft, e.g. `customer.phone`. */
  id: string;
  section: CustomerFieldSection;
  label: string;
  placeholder: string;
  hint: string;
  required: boolean;
  visible: boolean;
  order: number;
  /**
   * Locked fields underpin the warranty record itself — they can be relabelled
   * but never hidden or made optional.
   */
  locked: boolean;
}

export interface CustomerSectionConfig {
  id: CustomerFieldSection;
  title: string;
  description: string;
  order: number;
}

export interface StatusBlockConfig {
  id: string;
  label: string;
  visible: boolean;
  order: number;
  locked: boolean;
}

export interface CustomerExperienceConfig {
  register: {
    heading: string;
    subheading: string;
    sections: CustomerSectionConfig[];
    fields: CustomerFieldConfig[];
  };
  status: {
    heading: string;
    subheading: string;
    searchPlaceholder: string;
    helpText: string;
    blocks: StatusBlockConfig[];
  };
  updatedAt: string;
  updatedBy: string;
}

export interface Database {
  version: number;
  models: ProductModel[];
  serials: SerialNumber[];
  registrations: WarrantyRegistration[];
  photoRequirements: PhotoRequirement[];
  users: AdminAccount[];
  customerExperience: CustomerExperienceConfig;
  nextWarrantyId: number;
}

export interface LoginInput {
  email: string;
  password: string;
  remember: boolean;
}

export interface AuthenticatedSession {
  token: string;
  user: AdminUser;
  expiresAt: string;
}

export interface ProductModelInput {
  series: string;
  name: string;
  capacityKw: number;
  productType: ProductType;
  warrantyMonths: number;
  active: boolean;
}

export interface PhotoRequirementInput {
  label: string;
  instructions: string;
  required: boolean;
}

export interface CreateSerialInput {
  serial: string;
  modelId: string;
}

export interface WarrantyQuery {
  search?: string;
  status?: WarrantyStatus | "all";
  modelId?: string | "all";
  from?: string;
  to?: string;
  sortBy?: "id" | "customer" | "submittedAt";
  sortDir?: "asc" | "desc";
  page?: number;
  pageSize?: number;
}

export interface ApproveWarrantyInput {
  modelId: string;
  startDate?: string;
  durationMonths?: number;
  note?: string;
}

export interface CorrectionInput {
  message: string;
  items?: string[];
}
