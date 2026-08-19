import { clone, getDatabase, mutate } from "../data/store.js";
import {
  defaultCustomerExperience,
  defaultCustomerFields,
  defaultStatusBlocks,
} from "../data/customer-experience.defaults.js";
import type {
  CustomerExperienceConfig,
  CustomerFieldConfig,
  CustomerSectionConfig,
  StatusBlockConfig,
} from "../types.js";
import { AppError } from "../utils/errors.js";

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function requireLabel(value: unknown, what: string): string {
  const label = text(value);
  if (!label) {
    throw new AppError(`${what} cannot be blank.`, 400, "invalid_input");
  }
  if (label.length > 120) {
    throw new AppError(
      `${what} must be 120 characters or fewer.`,
      400,
      "invalid_input",
    );
  }
  return label;
}

function optionalText(value: unknown, what: string, max = 240): string {
  const result = text(value);
  if (result.length > max) {
    throw new AppError(
      `${what} must be ${max} characters or fewer.`,
      400,
      "invalid_input",
    );
  }
  return result;
}

/**
 * Reads the stored config, healing anything a hand-edited database is missing.
 *
 * New releases add fields and status blocks; rather than requiring a schema
 * migration for each one, unknown-to-stored entries are folded in at read time
 * so the public pages never render a half-configured form.
 */
function readConfig(): CustomerExperienceConfig {
  const stored = getDatabase().customerExperience;
  if (!stored) return defaultCustomerExperience();

  const defaults = defaultCustomerExperience();
  const knownFieldIds = new Set(stored.register.fields.map((field) => field.id));
  const missingFields = defaultCustomerFields().filter(
    (field) => !knownFieldIds.has(field.id),
  );
  const knownBlockIds = new Set(stored.status.blocks.map((block) => block.id));
  const missingBlocks = defaultStatusBlocks().filter(
    (block) => !knownBlockIds.has(block.id),
  );

  if (missingFields.length === 0 && missingBlocks.length === 0) return stored;

  return {
    ...stored,
    register: {
      ...stored.register,
      fields: [...stored.register.fields, ...missingFields],
    },
    status: {
      ...stored.status,
      blocks: [...stored.status.blocks, ...missingBlocks],
    },
    updatedAt: stored.updatedAt || defaults.updatedAt,
  };
}

export async function getCustomerExperience(): Promise<CustomerExperienceConfig> {
  return clone(readConfig());
}

/** Only the visible slice, ordered — what the public pages actually render. */
export async function getPublicCustomerExperience(): Promise<CustomerExperienceConfig> {
  const config = clone(readConfig());
  return {
    ...config,
    register: {
      ...config.register,
      sections: [...config.register.sections].sort((a, b) => a.order - b.order),
      fields: config.register.fields
        .filter((field) => field.visible || field.locked)
        .sort((a, b) => a.order - b.order),
    },
    status: {
      ...config.status,
      blocks: config.status.blocks
        .filter((block) => block.visible || block.locked)
        .sort((a, b) => a.order - b.order),
    },
  };
}

function mergeField(
  current: CustomerFieldConfig,
  patch: Partial<CustomerFieldConfig>,
): CustomerFieldConfig {
  const label = requireLabel(patch.label ?? current.label, "Field label");

  return {
    ...current,
    label,
    placeholder: optionalText(
      patch.placeholder ?? current.placeholder,
      "Placeholder",
    ),
    hint: optionalText(patch.hint ?? current.hint, "Help text"),
    // A locked field backs the warranty record itself, so it stays visible and
    // mandatory no matter what the request asks for.
    required: current.locked ? true : bool(patch.required, current.required),
    visible: current.locked ? true : bool(patch.visible, current.visible),
    order:
      typeof patch.order === "number" && Number.isFinite(patch.order)
        ? patch.order
        : current.order,
  };
}

function mergeSection(
  current: CustomerSectionConfig,
  patch: Partial<CustomerSectionConfig>,
): CustomerSectionConfig {
  return {
    ...current,
    title: requireLabel(patch.title ?? current.title, "Section title"),
    description: optionalText(
      patch.description ?? current.description,
      "Section description",
      400,
    ),
    order:
      typeof patch.order === "number" && Number.isFinite(patch.order)
        ? patch.order
        : current.order,
  };
}

function mergeBlock(
  current: StatusBlockConfig,
  patch: Partial<StatusBlockConfig>,
): StatusBlockConfig {
  return {
    ...current,
    label: requireLabel(patch.label ?? current.label, "Block label"),
    visible: current.locked ? true : bool(patch.visible, current.visible),
    order:
      typeof patch.order === "number" && Number.isFinite(patch.order)
        ? patch.order
        : current.order,
  };
}

export interface CustomerExperienceUpdate {
  register?: {
    heading?: string;
    subheading?: string;
    sections?: Partial<CustomerSectionConfig>[];
    fields?: Partial<CustomerFieldConfig>[];
  };
  status?: {
    heading?: string;
    subheading?: string;
    searchPlaceholder?: string;
    helpText?: string;
    blocks?: Partial<StatusBlockConfig>[];
  };
}

/**
 * Applies a partial update. Entries are matched by id — anything the payload
 * omits keeps its stored value, so the admin screen can save one section at a
 * time without shipping the whole config back.
 */
export async function updateCustomerExperience(
  update: CustomerExperienceUpdate,
  actor: string,
): Promise<CustomerExperienceConfig> {
  const current = readConfig();

  const fieldPatches = new Map(
    (update.register?.fields ?? [])
      .filter((field) => typeof field.id === "string")
      .map((field) => [field.id as string, field]),
  );
  const sectionPatches = new Map(
    (update.register?.sections ?? [])
      .filter((section) => typeof section.id === "string")
      .map((section) => [section.id as string, section]),
  );
  const blockPatches = new Map(
    (update.status?.blocks ?? [])
      .filter((block) => typeof block.id === "string")
      .map((block) => [block.id as string, block]),
  );

  const next: CustomerExperienceConfig = {
    register: {
      heading: requireLabel(
        update.register?.heading ?? current.register.heading,
        "Register page heading",
      ),
      subheading: optionalText(
        update.register?.subheading ?? current.register.subheading,
        "Register page subheading",
        400,
      ),
      sections: current.register.sections.map((section) =>
        mergeSection(section, sectionPatches.get(section.id) ?? {}),
      ),
      fields: current.register.fields.map((field) =>
        mergeField(field, fieldPatches.get(field.id) ?? {}),
      ),
    },
    status: {
      heading: requireLabel(
        update.status?.heading ?? current.status.heading,
        "Status page heading",
      ),
      subheading: optionalText(
        update.status?.subheading ?? current.status.subheading,
        "Status page subheading",
        400,
      ),
      searchPlaceholder: optionalText(
        update.status?.searchPlaceholder ?? current.status.searchPlaceholder,
        "Search placeholder",
      ),
      helpText: optionalText(
        update.status?.helpText ?? current.status.helpText,
        "Help text",
        400,
      ),
      blocks: current.status.blocks.map((block) =>
        mergeBlock(block, blockPatches.get(block.id) ?? {}),
      ),
    },
    updatedAt: new Date().toISOString(),
    updatedBy: actor || "Super Admin",
  };

  mutate((db) => {
    db.customerExperience = next;
  });

  return clone(next);
}

export async function resetCustomerExperience(
  actor: string,
): Promise<CustomerExperienceConfig> {
  const fresh = defaultCustomerExperience();
  fresh.updatedBy = actor || "Super Admin";

  mutate((db) => {
    db.customerExperience = fresh;
  });

  return clone(fresh);
}
