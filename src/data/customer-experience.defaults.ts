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

export function createSeedCustomerExperience(): CustomerExperienceConfig {
  return {
    register: {
      heading: "Register Warranty",
      subheading:
        "Complete the 3-step process to activate your hybrid inverter warranty.",
      sections: [
        {
          id: "customer",
          title: "Customer Information",
          description: "The warranty certificate is issued in this name.",
          order: 1,
        },
        {
          id: "installer",
          title: "Installer Information",
          description:
            "Details of the certified partner who installed the unit.",
          order: 2,
        },
        {
          id: "installation",
          title: "Installation Details",
          description:
            "Product details are taken from the serial you entered and the model you selected.",
          order: 3,
        },
      ],
      fields: [
        {
          id: "customer.fullName",
          section: "customer",
          label: "Full Name",
          placeholder: "",
          hint: "",
          required: true,
          visible: true,
          order: 1,
          locked: true,
        },
        {
          id: "customer.phone",
          section: "customer",
          label: "Phone Number",
          placeholder: "10 digit mobile number",
          hint: "",
          required: true,
          visible: true,
          order: 2,
          locked: true,
        },
        {
          id: "customer.email",
          section: "customer",
          label: "Email",
          placeholder: "name@example.com",
          hint: "",
          required: true,
          visible: true,
          order: 3,
          locked: true,
        },
        {
          id: "customer.address",
          section: "customer",
          label: "Address",
          placeholder: "House / flat number, street, area",
          hint: "",
          required: true,
          visible: true,
          order: 4,
          locked: true,
        },
        {
          id: "customer.city",
          section: "customer",
          label: "City",
          placeholder: "",
          hint: "",
          required: true,
          visible: true,
          order: 5,
          locked: true,
        },
        {
          id: "customer.state",
          section: "customer",
          label: "State",
          placeholder: "Select state",
          hint: "",
          required: true,
          visible: true,
          order: 6,
          locked: true,
        },
        {
          id: "customer.pincode",
          section: "customer",
          label: "PIN Code",
          placeholder: "",
          hint: "",
          required: true,
          visible: true,
          order: 7,
          locked: true,
        },
        {
          id: "installer.companyName",
          section: "installer",
          label: "Installer Name / Company",
          placeholder: "",
          hint: "",
          required: true,
          visible: true,
          order: 1,
          locked: true,
        },
        {
          id: "installer.contactName",
          section: "installer",
          label: "Contact Person",
          placeholder: "",
          hint: "",
          required: true,
          visible: true,
          order: 2,
          locked: true,
        },
        {
          id: "installer.contactNumber",
          section: "installer",
          label: "Contact Number",
          placeholder: "",
          hint: "",
          required: true,
          visible: true,
          order: 3,
          locked: true,
        },
        {
          id: "installer.email",
          section: "installer",
          label: "Email",
          placeholder: "",
          hint: "",
          required: true,
          visible: true,
          order: 4,
          locked: true,
        },
        {
          id: "installer.installerId",
          section: "installer",
          label: "Installer ID / Registration Number",
          placeholder: "AW-INST-0000",
          hint: "Optional — printed on the Aurawatt partner certificate.",
          required: false,
          visible: true,
          order: 5,
          locked: false,
        },
        {
          id: "installation.installationDate",
          section: "installation",
          label: "Installation Date",
          placeholder: "",
          hint: "Warranty coverage is calculated from this date.",
          required: true,
          visible: true,
          order: 1,
          locked: true,
        },
        {
          id: "installation.installationAddress",
          section: "installation",
          label: "Installation Address",
          placeholder: "Full address of the site where the inverter is installed",
          hint: "",
          required: true,
          visible: true,
          order: 2,
          locked: true,
        },
        {
          id: "installation.batteryInstalled",
          section: "installation",
          label: "A battery system was installed with this inverter",
          placeholder: "",
          hint: "Battery packs are covered by their own warranty term.",
          required: false,
          visible: true,
          order: 3,
          locked: false,
        },
        {
          id: "installation.batterySerial",
          section: "installation",
          label: "Battery Serial Number",
          placeholder: "Enter battery serial number",
          hint: "",
          required: false,
          visible: true,
          order: 4,
          locked: false,
        },
      ],
    },
    status: {
      heading: "Check Warranty Status",
      subheading:
        "Enter your Warranty ID to check the current status of your registration, validity period and coverage details.",
      searchPlaceholder: "Enter Warranty ID (e.g. 1024)",
      helpText:
        "Your warranty ID was sent to you when the registration was submitted. It also appears on your warranty certificate.",
      blocks: [
        { id: "serial", label: "Serial Number", visible: true, order: 1, locked: true },
        { id: "product", label: "Product", visible: true, order: 2, locked: true },
        { id: "capacity", label: "Capacity", visible: true, order: 3, locked: true },
        { id: "submittedOn", label: "Submitted On", visible: true, order: 4, locked: true },
        { id: "customer", label: "Customer", visible: true, order: 5, locked: true },
        { id: "reviewedOn", label: "Last Reviewed", visible: true, order: 6, locked: false },
        { id: "coverage", label: "Coverage", visible: true, order: 7, locked: false },
      ],
    },
    updatedAt: new Date().toISOString(),
    updatedBy: "System",
  };
}
