import type { Database, PhotoRequirement, ProductModel } from "../types.js";
import { createEmptyCustomerExperience } from "./customer-experience.defaults.js";

export const DB_VERSION = 7;

export const SEED_PHOTO_REQUIREMENTS: PhotoRequirement[] = [];
export const SEED_MODELS: ProductModel[] = [];

export function ensureCustomerTestSerials(_db: Database): boolean {
  return false;
}

export function createSeedDatabase(): Database {
  return {
    version: DB_VERSION,
    models: [],
    serials: [],
    series: [],
    serialImportFiles: [],
    registrations: [],
    photoRequirements: [],
    users: [],
    customerExperience: createEmptyCustomerExperience(),
    nextWarrantyId: 1,
  };
}
