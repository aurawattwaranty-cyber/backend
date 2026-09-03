import type {
  CustomerExperienceConfig,
  CustomerFieldConfig,
  CustomerSectionConfig,
  StatusBlockConfig,
} from "../types.js";

export function defaultCustomerFields(): CustomerFieldConfig[] {
  return [];
}

export function defaultStatusBlocks(): StatusBlockConfig[] {
  return [];
}

export function defaultCustomerExperience(): CustomerExperienceConfig {
  return {
    register: {
      heading: "",
      subheading: "",
      sections: [] as CustomerSectionConfig[],
      fields: [],
    },
    status: {
      heading: "",
      subheading: "",
      searchPlaceholder: "",
      helpText: "",
      blocks: [],
    },
    updatedAt: new Date().toISOString(),
    updatedBy: "System",
  };
}

export function createEmptyCustomerExperience(): CustomerExperienceConfig {
  return defaultCustomerExperience();
}
