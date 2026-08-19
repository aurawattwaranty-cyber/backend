import type {
  CustomerExperienceConfig,
  CustomerFieldConfig,
  CustomerSectionConfig,
  StatusBlockConfig,
} from "../types.js";

/**
 * Factory defaults for the customer-facing form and status page.
 *
 * These mirror the copy the public pages shipped with, so a database that has
 * never been touched by a super admin renders exactly as before. Every entry
 * here is also the reset target for `resetCustomerExperience`.
 */

const SECTIONS: CustomerSectionConfig[] = [
  {
    id: "customer",
    title: "Customer Information",
    description: "The warranty certificate is issued in this name.",
    order: 1,
  },
  {
    id: "installer",
    title: "Installer Information",
    description: "Details of the certified partner who installed the unit.",
    order: 2,
  },
  {
    id: "installation",
    title: "Installation Details",
    description:
      "Product details are taken from the serial you entered and the model you selected.",
    order: 3,
  },
];

interface FieldDefault {
  id: string;
  section: CustomerFieldConfig["section"];
  label: string;
  placeholder?: string;
  hint?: string;
  required: boolean;
  locked?: boolean;
}

const FIELDS: FieldDefault[] = [
  {
    id: "customer.fullName",
    section: "customer",
    label: "Full Name",
    required: true,
    locked: true,
  },
  {
    id: "customer.phone",
    section: "customer",
    label: "Phone Number",
    placeholder: "10 digit mobile number",
    required: true,
    locked: true,
  },
  {
    id: "customer.email",
    section: "customer",
    label: "Email",
    placeholder: "name@example.com",
    required: true,
  },
  {
    id: "customer.address",
    section: "customer",
    label: "Address",
    placeholder: "House / flat number, street, area",
    required: true,
  },
  { id: "customer.city", section: "customer", label: "City", required: true },
  { id: "customer.state", section: "customer", label: "State", required: true },
  {
    id: "customer.pincode",
    section: "customer",
    label: "PIN Code",
    required: true,
  },
  {
    id: "installer.companyName",
    section: "installer",
    label: "Installer Name / Company",
    required: true,
  },
  {
    id: "installer.contactName",
    section: "installer",
    label: "Contact Person",
    required: true,
  },
  {
    id: "installer.contactNumber",
    section: "installer",
    label: "Contact Number",
    required: true,
  },
  {
    id: "installer.email",
    section: "installer",
    label: "Email",
    required: true,
  },
  {
    id: "installer.installerId",
    section: "installer",
    label: "Installer ID / Registration Number",
    placeholder: "AW-INST-0000",
    hint: "Optional — printed on the Aurawatt partner certificate.",
    required: false,
  },
  {
    id: "installation.installationDate",
    section: "installation",
    label: "Installation Date",
    hint: "Warranty coverage is calculated from this date.",
    required: true,
    locked: true,
  },
  {
    id: "installation.installationAddress",
    section: "installation",
    label: "Installation Address",
    placeholder:
      "Full address of the site where the inverter is installed",
    required: true,
  },
  {
    id: "installation.batteryInstalled",
    section: "installation",
    label: "A battery system was installed with this inverter",
    hint: "Battery packs are covered by their own warranty term.",
    required: false,
  },
  {
    id: "installation.batteryModelId",
    section: "installation",
    label: "Battery Model",
    placeholder: "Select battery model",
    required: true,
  },
  {
    id: "installation.batterySerial",
    section: "installation",
    label: "Battery Serial Number",
    placeholder: "Enter battery serial number",
    required: true,
  },
];

interface BlockDefault {
  id: string;
  label: string;
  locked?: boolean;
}

const STATUS_BLOCKS: BlockDefault[] = [
  { id: "serial", label: "Serial Number", locked: true },
  { id: "product", label: "Product" },
  { id: "capacity", label: "Capacity" },
  { id: "submittedOn", label: "Submitted On" },
  { id: "customer", label: "Customer Name" },
  { id: "reviewedOn", label: "Last Reviewed" },
  { id: "coverage", label: "Warranty Coverage Period" },
  { id: "certificate", label: "Certificate & Verification" },
];

export function defaultCustomerFields(): CustomerFieldConfig[] {
  return FIELDS.map((field, index) => ({
    id: field.id,
    section: field.section,
    label: field.label,
    placeholder: field.placeholder ?? "",
    hint: field.hint ?? "",
    required: field.required,
    visible: true,
    order: index + 1,
    locked: field.locked ?? false,
  }));
}

export function defaultStatusBlocks(): StatusBlockConfig[] {
  return STATUS_BLOCKS.map((block, index) => ({
    id: block.id,
    label: block.label,
    visible: true,
    order: index + 1,
    locked: block.locked ?? false,
  }));
}

export function defaultCustomerExperience(): CustomerExperienceConfig {
  return {
    register: {
      heading: "Register Your Warranty",
      subheading:
        "Complete all three steps to activate your Aurawatt hybrid inverter warranty.",
      sections: SECTIONS.map((section) => ({ ...section })),
      fields: defaultCustomerFields(),
    },
    status: {
      heading: "Check Warranty Status",
      subheading:
        "Enter your Warranty ID to check the current status of your registration, validity period and coverage details.",
      searchPlaceholder: "Enter Warranty ID (e.g. 1024)",
      helpText:
        "Your warranty ID was sent to you when the registration was submitted. It also appears on your warranty certificate.",
      blocks: defaultStatusBlocks(),
    },
    updatedAt: new Date().toISOString(),
    updatedBy: "System",
  };
}
