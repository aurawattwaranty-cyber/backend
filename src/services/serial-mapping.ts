import type { ProductModel, SerialNumber } from "../types.js";
import { createId } from "../data/store.js";
import { normaliseSerial } from "../utils/validation.js";

interface SerialModelRule {
  pattern: RegExp;
  modelId: string;
}

const SERIAL_MODEL_RULES: SerialModelRule[] = [
  { pattern: /^AW-HI-3KW-/, modelId: "mdl-hp-3" },
  { pattern: /^AW-HI-5KW-/, modelId: "mdl-hp-5" },
  { pattern: /^AW-HI-7KW-/, modelId: "mdl-hp-75" },
  { pattern: /^AW-HI-10KW-/, modelId: "mdl-hm-10" },
  { pattern: /^AW-HI-15KW-/, modelId: "mdl-hm-15" },
  { pattern: /^AW-HI-20KW-/, modelId: "mdl-hu-20" },
  { pattern: /^AW-BT-51-/, modelId: "mdl-pc-51" },
  { pattern: /^AW-BT-102-/, modelId: "mdl-pc-102" },
];

export function inferModelForSerial(
  serial: string,
  models: ProductModel[],
): ProductModel | null {
  const normalized = normaliseSerial(serial);
  if (!normalized) return null;

  const rule = SERIAL_MODEL_RULES.find((entry) => entry.pattern.test(normalized));
  if (!rule) return null;

  return (
    models.find((model) => model.id === rule.modelId && model.active) ?? null
  );
}

export function buildSerialRecord(
  serial: string,
  model: ProductModel,
): SerialNumber {
  return {
    id: createId("srl"),
    serial: normaliseSerial(serial),
    modelId: model.id,
    modelName: model.name,
    capacityKw: model.capacityKw,
    productType: model.productType,
    status: "available",
    addedAt: new Date().toISOString(),
  };
}
