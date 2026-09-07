import type {
  Database,
  PhotoRequirement,
  ProductModel,
  ProductType,
} from "../types.js";
import {
  createEmptyCustomerExperience,
  createSeedCustomerExperience,
} from "./customer-experience.defaults.js";

export const DB_VERSION = 7;

export const SEED_PHOTO_REQUIREMENTS: PhotoRequirement[] = [
  {
    id: "default-installation-overview",
    label: "Installation overview",
    instructions:
      "Upload a clear photo showing the installed Aurawatt equipment and its surroundings.",
    required: true,
    order: 1,
  },
  {
    id: "default-product-label",
    label: "Product label",
    instructions:
      "Upload a clear photo of the product label showing the serial number.",
    required: true,
    order: 2,
  },
  {
    id: "default-wiring-panel",
    label: "Wiring and panel",
    instructions:
      "Upload a clear photo of the wiring, connections and nearby electrical panel.",
    required: true,
    order: 3,
  },
];
const SEED_MODEL_ROWS: Array<
  [string, string, string, number, ProductType, number]
> = [
  ["sp-2kw", "SP SERIES (2 KW / 12V / IP54)", "AW-SP-L2-2000", 2, "inverter", 60],
  ["sp-36kw-24v", "SP SERIES (3.6 KW / 24V / IP54)", "AW-SP-L1-3600", 3.6, "inverter", 60],
  ["sp-65kw", "SP SERIES (6.5 KW / 48V / IP54)", "AW-SP-L1-6500", 6.5, "inverter", 60],
  ["sp-36kw-ip21", "SP SERIES (3.6 KW / 24V / IP21)", "AW-SP-3600", 3.6, "inverter", 60],
  ["sp-3kw", "SP SERIES (3-6 KW / 48V / IP66)", "AW-SP-3000", 3, "inverter", 96],
  ["sp-4kw", "SP SERIES (3-6 KW / 48V / IP66)", "AW-SP-4000", 4, "inverter", 96],
  ["sp-5kw", "SP SERIES (3-6 KW / 48V / IP66)", "AW-SP-5000", 5, "inverter", 96],
  ["sp-6kw", "SP SERIES (3-6 KW / 48V / IP66)", "AW-SP-6000", 6, "inverter", 96],
  ["sp-8kw", "SP SERIES (8-11 KW / 48V / IP21)", "AW-SP-8000", 8, "inverter", 60],
  ["sp-10kw", "SP SERIES (8-11 KW / 48V / IP21)", "AW-SP-10000", 10, "inverter", 60],
  ["sp-11kw", "SP SERIES (8-11 KW / 48V / IP21)", "AW-SP-11000", 11, "inverter", 60],
  ["sp-combo-36", "ALL-IN-ONE SERIES", "AW-SP-L1-3600-C", 3.6, "combo", 60],
  ["tp-l-8kw", "TP-L SERIES", "AW-TP 8000-L", 8, "inverter", 96],
  ["tp-l-10kw", "TP-L SERIES", "AW-TP 10000-L", 10, "inverter", 96],
  ["tp-l-12kw", "TP-L SERIES", "AW-TP 12000-L", 12, "inverter", 96],
  ["tp-h-15kw", "TP-H SERIES", "AW-TP-15000-H", 15, "inverter", 96],
  ["tp-h-20kw", "TP-H SERIES", "AW-TP-20000-H", 20, "inverter", 96],
  ["tp-h-25kw", "TP-H SERIES", "AW-TP-25000-H", 25, "inverter", 96],
  ["tp-h-30kw", "TP-H SERIES", "AW-TP-30000-H", 30, "inverter", 96],
  ["tp-h-50kw", "TP-H SERIES", "AW-TP-50000-H", 50, "inverter", 96],
  ["lfp-128", "AURAWATT LFP SERIES(12.8V/100AH)", "AW-LFP-12.8", 1.2, "battery", 60],
  ["lfp-256", "AURAWATT LFP SERIES(25.6V/100AH)", "AW-LFP-25.6", 2.56, "battery", 60],
  ["lfp-512-5", "AURAWATT LFP SERIES(51.2V/100AH) - 5/10", "AW-LFP-51.2-5", 5.12, "battery", 60],
  ["lfp-512-10", "AURAWATT LFP SERIES(51.2V/100AH) - 5/10", "AW-LFP-51.2-10", 5.12, "battery", 120],
];

export const SEED_MODELS: ProductModel[] = SEED_MODEL_ROWS.map(
  ([id, series, name, capacityKw, productType, warrantyMonths]) => ({
  id: `mdl-${id}`,
  series,
  name,
  capacityKw,
  productType,
  warrantyMonths,
  active: true,
  createdAt: "2026-09-07T00:00:00.000Z",
  }),
);

export function ensureCustomerTestSerials(_db: Database): boolean {
  return false;
}

export function createSeedDatabase(): Database {
  return {
    version: DB_VERSION,
    models: [...SEED_MODELS],
    serials: [],
    series: [],
    serialImportFiles: [],
    registrations: [],
    photoRequirements: [...SEED_PHOTO_REQUIREMENTS],
    users: [],
    customerExperience: createSeedCustomerExperience(),
    nextWarrantyId: 1,
  };
}

export function createBlankDatabase(): Database {
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
