import { clone, createId, getDatabase, mutate } from "../data/store.js";
import type { PhotoRequirement, PhotoRequirementInput } from "../types.js";
import { AppError } from "../utils/errors.js";
import { requiredText } from "../utils/validation.js";

function sortByOrder(requirements: PhotoRequirement[]): PhotoRequirement[] {
  return [...requirements].sort((a, b) => a.order - b.order);
}

export async function getPhotoRequirements(): Promise<PhotoRequirement[]> {
  return sortByOrder(clone(getDatabase().photoRequirements));
}

export async function createPhotoRequirement(
  input: PhotoRequirementInput,
): Promise<PhotoRequirement> {
  const label = requiredText(input.label);
  const instructions = requiredText(input.instructions);

  if (!label) {
    throw new AppError("Enter a label for this photo.", 400, "invalid_input");
  }
  if (instructions.length < 10) {
    throw new AppError(
      "Add instructions so customers know exactly what to photograph.",
      400,
      "invalid_input",
    );
  }

  const db = getDatabase();
  if (
    db.photoRequirements.some(
      (entry) => entry.label.toLowerCase() === label.toLowerCase(),
    )
  ) {
    throw new AppError(
      `A requirement called "${label}" already exists.`,
      409,
      "duplicate_requirement",
    );
  }

  const requirement: PhotoRequirement = {
    id: createId("pr"),
    label,
    instructions,
    required: input.required,
    order:
      db.photoRequirements.reduce((max, entry) => Math.max(max, entry.order), 0) +
      1,
  };

  mutate((store) => store.photoRequirements.push(requirement));
  return clone(requirement);
}

export async function updatePhotoRequirement(
  id: string,
  input: Partial<PhotoRequirementInput>,
): Promise<PhotoRequirement> {
  const updated = mutate((db) => {
    const requirement = db.photoRequirements.find((entry) => entry.id === id);
    if (!requirement) {
      throw new AppError("That requirement no longer exists.", 404, "not_found");
    }
    if (input.label !== undefined) {
      const label = requiredText(input.label);
      if (!label) {
        throw new AppError("Enter a label for this photo.", 400, "invalid_input");
      }
      requirement.label = label;
    }
    if (input.instructions !== undefined) {
      const instructions = requiredText(input.instructions);
      if (instructions.length < 10) {
        throw new AppError(
          "Add instructions so customers know exactly what to photograph.",
          400,
          "invalid_input",
        );
      }
      requirement.instructions = instructions;
    }
    if (input.required !== undefined) requirement.required = input.required;
    return requirement;
  });
  return clone(updated);
}

export async function deletePhotoRequirement(id: string): Promise<void> {
  mutate((db) => {
    const index = db.photoRequirements.findIndex((entry) => entry.id === id);
    if (index === -1) {
      throw new AppError("That requirement no longer exists.", 404, "not_found");
    }
    db.photoRequirements.splice(index, 1);
    sortByOrder(db.photoRequirements).forEach((entry, position) => {
      entry.order = position + 1;
    });
  });
}

export async function movePhotoRequirement(
  id: string,
  direction: "up" | "down",
): Promise<PhotoRequirement[]> {
  const reordered = mutate((db) => {
    const ordered = sortByOrder(db.photoRequirements);
    const index = ordered.findIndex((entry) => entry.id === id);
    const target = direction === "up" ? index - 1 : index + 1;
    if (index === -1 || target < 0 || target >= ordered.length) return ordered;

    const current = ordered[index];
    const neighbor = ordered[target];
    if (!current || !neighbor) return ordered;
    [ordered[index], ordered[target]] = [neighbor, current];
    ordered.forEach((entry, position) => {
      entry.order = position + 1;
    });
    db.photoRequirements = ordered;
    return ordered;
  });

  return sortByOrder(clone(reordered));
}
