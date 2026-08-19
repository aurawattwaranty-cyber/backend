import { clone, getDatabase, mutate } from "../data/store.js";
import type {
  ApproveWarrantyInput,
  CorrectionInput,
  DashboardStats,
  Paginated,
  RegistrationDraft,
  WarrantyEvent,
  WarrantyEventType,
  WarrantyRegistration,
  WarrantyStatus,
  WarrantyQuery,
} from "../types.js";
import { calculateWarrantyPeriod, isExpired, toIsoDate } from "../utils/dates.js";
import { AppError } from "../utils/errors.js";
import { paginate } from "../utils/pagination.js";
import { buildSerialRecord } from "./serial-mapping.js";
import { requiredText, validateEmail, validateInstallationDate, validatePhone, validatePincode } from "../utils/validation.js";

function safeText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function makeEvent(
  type: WarrantyEventType,
  label: string,
  actor: string,
  note?: string,
): WarrantyEvent {
  const at = new Date().toISOString();
  return {
    id: `${type}-${at}`,
    type,
    label,
    actor,
    at,
    ...(note ? { note } : {}),
  };
}

function ensureExpiredSync(): void {
  const stale = getDatabase().registrations.filter(
    (registration) =>
      registration.status === "active" &&
      registration.warrantyEnd &&
      isExpired(registration.warrantyEnd),
  );
  if (stale.length === 0) return;

  mutate((db) => {
    db.registrations.forEach((registration) => {
      if (!stale.some((entry) => entry.id === registration.id)) return;
      registration.status = "expired";
      registration.history.push(
        makeEvent(
          "expired",
          "Warranty Expired",
          "System",
          `${registration.warrantyMonths ?? 0} month warranty term completed.`,
        ),
      );
    });
  });
}

function findRegistration(id: string): WarrantyRegistration {
  const normalized = id.trim().replace(/^#/, "");
  const registration = getDatabase().registrations.find(
    (entry) => entry.id === normalized,
  );
  if (!registration) {
    throw new AppError(
      `We couldn't find a warranty with ID ${normalized}. Check the ID from your registration confirmation and try again.`,
      404,
      "not_found",
    );
  }
  return registration;
}

function validateRegistrationDraft(draft: RegistrationDraft): void {
  const serial = requiredText(draft.serial);
  const modelId = requiredText(draft.modelId);
  const modelName = requiredText(draft.modelName);
  const customer = draft.customer ?? ({} as RegistrationDraft["customer"]);
  const installer = draft.installer ?? ({} as RegistrationDraft["installer"]);
  const installation = draft.installation ?? ({} as RegistrationDraft["installation"]);
  const photos = Array.isArray(draft.photos) ? draft.photos : [];

  if (!serial) {
    throw new AppError("Enter a serial number.", 400, "invalid_input");
  }
  if (!modelId) {
    throw new AppError("Choose a product model.", 400, "invalid_input");
  }
  if (!modelName) {
    throw new AppError("Choose a product model.", 400, "invalid_input");
  }
  if (!installation.installationDate || !validateInstallationDate(installation.installationDate)) {
    throw new AppError(
      "Enter a valid installation date.",
      400,
      "invalid_input",
    );
  }
  if (!safeText(customer.fullName)) {
    throw new AppError("Customer name is required.", 400, "invalid_input");
  }
  if (!validatePhone(requiredText(customer.phone))) {
    throw new AppError("Enter a 10 digit mobile number.", 400, "invalid_input");
  }
  if (!validateEmail(requiredText(customer.email))) {
    throw new AppError("Enter a valid customer email address.", 400, "invalid_input");
  }
  if (!validatePincode(requiredText(customer.pincode))) {
    throw new AppError("Enter a valid 6 digit PIN code.", 400, "invalid_input");
  }
  if (!requiredText(installer.companyName) || !requiredText(installer.contactName)) {
    throw new AppError("Installer details are required.", 400, "invalid_input");
  }
  if (!photos.length) {
    throw new AppError("Upload the installation photos before submitting.", 400, "invalid_input");
  }
}

export async function createWarrantyRegistration(
  draft: RegistrationDraft,
): Promise<WarrantyRegistration> {
  validateRegistrationDraft(draft);
  const db = getDatabase();
  const serial = requiredText(draft.serial);
  const modelId = requiredText(draft.modelId);
  const customer = draft.customer;
  const installer = draft.installer;
  const installation = draft.installation;
  const photos = Array.isArray(draft.photos) ? draft.photos : [];

  const serialRecord = db.serials.find((entry) => entry.serial === serial);
  if (serialRecord?.status === "registered") {
    throw new AppError(
      "This serial number was registered by someone else while you were completing the form.",
      409,
      "serial_taken",
    );
  }
  const model = db.models.find((entry) => entry.id === modelId);
  if (!model) {
    throw new AppError("That product model no longer exists.", 404, "not_found");
  }
  if (serialRecord && serialRecord.modelId !== modelId) {
    throw new AppError(
      "The serial number does not match the selected product model.",
      400,
      "model_mismatch",
    );
  }

  const id = String(db.nextWarrantyId);
  const registration: WarrantyRegistration = {
    id,
    serial,
    modelId,
    modelName: model.name,
    capacityKw: model.capacityKw,
    productType: model.productType,
    customer,
    installer,
    installation: {
      ...installation,
      productType: model.productType,
      modelId: model.id,
      modelName: model.name,
      capacityKw: model.capacityKw,
    },
    photos,
    status: "pending",
    submittedAt: new Date().toISOString(),
    history: [
      makeEvent("submitted", "Registration Submitted", customer.fullName),
    ],
  };

  mutate((store) => {
    store.registrations.unshift(registration);
    store.nextWarrantyId += 1;
    const storedSerial = store.serials.find((entry) => entry.serial === serial);
    if (storedSerial) {
      storedSerial.status = "registered";
      storedSerial.warrantyId = id;
    } else {
      const newSerial = buildSerialRecord(serial, model);
      store.serials.unshift({
        ...newSerial,
        status: "registered",
        warrantyId: id,
      });
    }
  });

  return clone(registration);
}

export async function getWarrantyStatus(
  warrantyId: string,
): Promise<WarrantyRegistration> {
  const id = warrantyId.trim().replace(/^#/, "");
  if (!id) {
    throw new AppError("Enter a warranty ID to continue.", 400, "empty_id");
  }
  ensureExpiredSync();
  return clone(findRegistration(id));
}

export async function resubmitWarranty(
  warrantyId: string,
  note?: string,
): Promise<WarrantyRegistration> {
  const updated = mutate((db) => {
    const registration = db.registrations.find((entry) => entry.id === warrantyId);
    if (!registration) {
      throw new AppError("That registration no longer exists.", 404, "not_found");
    }
    if (registration.status !== "correction") {
      throw new AppError(
        "This registration isn't awaiting a correction.",
        400,
        "invalid_state",
      );
    }
    registration.status = "pending";
    delete registration.decisionNote;
    delete registration.correctionItems;
    registration.history.push(
      makeEvent(
        "resubmitted",
        "Corrections Resubmitted",
        registration.customer.fullName,
        note,
      ),
    );
    return registration;
  });

  return clone(updated);
}

function compareRegistrations(
  a: WarrantyRegistration,
  b: WarrantyRegistration,
  field: "id" | "customer" | "submittedAt",
): number {
  switch (field) {
    case "id":
      return Number(a.id) - Number(b.id);
    case "customer":
      return a.customer.fullName.localeCompare(b.customer.fullName);
    default:
      return a.submittedAt.localeCompare(b.submittedAt);
  }
}

export async function getWarrantyRegistrations(
  query: WarrantyQuery = {},
): Promise<Paginated<WarrantyRegistration>> {
  ensureExpiredSync();

  const {
    search = "",
    status = "all",
    modelId = "all",
    from,
    to,
    sortBy = "submittedAt",
    sortDir = "desc",
    page = 1,
    pageSize = 10,
  } = query;
  const term = search.trim().toLowerCase();

  const filtered = getDatabase()
    .registrations.filter((registration) => {
      if (status !== "all" && registration.status !== status) return false;
      if (modelId !== "all" && registration.modelId !== modelId) return false;

      const submittedDate = toIsoDate(registration.submittedAt);
      if (from && submittedDate < from) return false;
      if (to && submittedDate > to) return false;

      if (!term) return true;
      return (
        registration.id.toLowerCase().includes(term) ||
        registration.serial.toLowerCase().includes(term) ||
        registration.customer.fullName.toLowerCase().includes(term) ||
        registration.customer.phone.includes(term) ||
        registration.modelName.toLowerCase().includes(term)
      );
    })
    .sort((a, b) => {
      const order = compareRegistrations(a, b, sortBy);
      return sortDir === "asc" ? order : -order;
    });

  return paginate(clone(filtered), page, pageSize);
}

export async function getWarrantyById(id: string): Promise<WarrantyRegistration> {
  ensureExpiredSync();
  return clone(findRegistration(id));
}

export async function getDashboardStats(): Promise<DashboardStats> {
  ensureExpiredSync();
  const db = getDatabase();
  const byStatus = (status: WarrantyStatus) =>
    db.registrations.filter((entry) => entry.status === status).length;

  return {
    totalRegistrations: db.registrations.length,
    pendingReview: byStatus("pending"),
    activeWarranties: byStatus("active"),
    rejected: byStatus("rejected"),
    correctionRequired: byStatus("correction"),
    serialsAvailable: db.serials.filter((entry) => entry.status === "available").length,
    serialsRegistered: db.serials.filter((entry) => entry.status === "registered").length,
  };
}

export async function getRecentRegistrations(
  limit = 5,
): Promise<WarrantyRegistration[]> {
  const page = await getWarrantyRegistrations({ page: 1, pageSize: limit });
  return page.items;
}

export async function approveWarranty(
  id: string,
  input: ApproveWarrantyInput,
): Promise<WarrantyRegistration> {
  const updated = mutate((db) => {
    const registration = db.registrations.find((entry) => entry.id === id);
    if (!registration) {
      throw new AppError("That registration no longer exists.", 404, "not_found");
    }
    if (registration.status === "active") {
      throw new AppError(
        "This warranty has already been activated.",
        400,
        "already_active",
      );
    }

    const modelId = requiredText(input.modelId);
    const model = db.models.find((entry) => entry.id === modelId);
    if (!model) {
      throw new AppError(
        "Select the product model that matches the side label before approving.",
        400,
        "invalid_model",
      );
    }

    const serial = db.serials.find((entry) => entry.serial === registration.serial);
    if (!serial) {
      throw new AppError("The serial number is missing from inventory.", 400, "invalid_serial");
    }
    if (serial.warrantyId && serial.warrantyId !== registration.id) {
      throw new AppError(
        "This serial number has already been assigned to another warranty.",
        409,
        "serial_taken",
      );
    }

    const start = requiredText(input.startDate) || registration.installation.installationDate;
    const months = input.durationMonths ?? model.warrantyMonths;
    const note = requiredText(input.note);
    const period = calculateWarrantyPeriod(start, months);

    if (!period.start || !period.end) {
      throw new AppError(
        "The installation date is invalid, so the warranty period can't be calculated.",
        400,
        "invalid_date",
      );
    }

    registration.modelId = model.id;
    registration.modelName = model.name;
    registration.capacityKw = model.capacityKw;
    registration.productType = model.productType;
    registration.installation.modelId = model.id;
    registration.installation.modelName = model.name;
    registration.installation.capacityKw = model.capacityKw;

    registration.status = isExpired(period.end) ? "expired" : "active";
    registration.reviewedAt = new Date().toISOString();
    delete registration.decisionNote;
    delete registration.correctionItems;
    registration.warrantyStart = period.start;
    registration.warrantyEnd = period.end;
    registration.warrantyMonths = period.durationMonths;

    serial.status = "registered";
    serial.warrantyId = registration.id;

    registration.history.push(
      makeEvent("verified", "Evidence Verified", "Admin", `Model set to ${model.name}.`),
      makeEvent("approved", "Registration Approved", "Admin", note),
      makeEvent(
        "activated",
        "Warranty Activated",
        "System",
        `${period.durationMonths} month warranty applied from ${period.start}.`,
      ),
    );

    return registration;
  });

  return clone(updated);
}

export async function requestCorrection(
  id: string,
  input: CorrectionInput,
): Promise<WarrantyRegistration> {
  const message = requiredText(input.message);
  if (message.length < 10) {
    throw new AppError(
      "Add a short explanation (at least 10 characters) so the customer knows what to fix.",
      400,
      "invalid_input",
    );
  }

  const updated = mutate((db) => {
    const registration = db.registrations.find((entry) => entry.id === id);
    if (!registration) {
      throw new AppError("That registration no longer exists.", 404, "not_found");
    }
    registration.status = "correction";
    registration.reviewedAt = new Date().toISOString();
    registration.decisionNote = message;
    if (input.items?.length) {
      registration.correctionItems = input.items;
    } else {
      delete registration.correctionItems;
    }
    registration.history.push(
      makeEvent("correction", "Correction Requested", "Admin", message),
    );
    return registration;
  });

  return clone(updated);
}

export async function rejectWarranty(
  id: string,
  reason: string,
): Promise<WarrantyRegistration> {
  const message = requiredText(reason);
  if (message.length < 10) {
    throw new AppError(
      "A rejection reason of at least 10 characters is required.",
      400,
      "invalid_input",
    );
  }

  const updated = mutate((db) => {
    const registration = db.registrations.find((entry) => entry.id === id);
    if (!registration) {
      throw new AppError("That registration no longer exists.", 404, "not_found");
    }
    registration.status = "rejected";
    registration.reviewedAt = new Date().toISOString();
    registration.decisionNote = message;
    delete registration.warrantyStart;
    delete registration.warrantyEnd;
    delete registration.warrantyMonths;
    registration.history.push(
      makeEvent("rejected", "Registration Rejected", "Admin", message),
    );

    const serial = db.serials.find((entry) => entry.serial === registration.serial);
    if (serial) {
      serial.status = "available";
      delete serial.warrantyId;
    }

    return registration;
  });

  return clone(updated);
}
