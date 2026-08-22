export type Workflow =
  Record<
    string,
    Record<string, unknown>
  >;

export class WorkflowInputError
  extends Error {}

function validateImageName(
  value: string
) {
  const name =
    value.trim();

  if (!name) {
    throw new WorkflowInputError(
      "Image filename cannot be empty"
    );
  }

  if (
    name.includes("\0") ||
    name.startsWith("/") ||
    /^[A-Za-z]:[\\/]/.test(name)
  ) {
    throw new WorkflowInputError(
      "Image must be a relative Comfy input filename"
    );
  }

  const parts =
    name
      .replaceAll("\\", "/")
      .split("/");

  if (
    parts.some(
      part =>
        part === ".."
    )
  ) {
    throw new WorkflowInputError(
      "Image filename cannot contain '..'"
    );
  }

  return name;
}

function loadImageNodes(
  workflow: Workflow
) {
  return Object.entries(
    workflow
  ).filter(
    ([, node]) =>
      node.class_type ===
      "LoadImage"
  );
}

export function applyImageInput(
  workflow: Workflow,
  image: string
): Workflow {
  const filename =
    validateImageName(image);

  const copy =
    structuredClone(
      workflow
    );

  const candidates =
    loadImageNodes(copy);

  if (
    candidates.length === 0
  ) {
    throw new WorkflowInputError(
      "Workflow contains no LoadImage node"
    );
  }

  const titled =
    candidates.filter(
      ([, node]) => {
        const meta =
          node._meta;

        return (
          meta !== null &&
          typeof meta ===
            "object" &&
          !Array.isArray(meta) &&
          (
            meta as
              Record<
                string,
                unknown
              >
          ).title ===
            "Load First Frame"
        );
      }
    );

  const selected =
    titled.length === 1
      ? titled[0]
      : candidates.length === 1
        ? candidates[0]
        : null;

  if (!selected) {
    throw new WorkflowInputError(
      "Workflow has multiple LoadImage nodes and no unique 'Load First Frame' target"
    );
  }

  const [
    nodeId,
    node
  ] = selected;

  const inputs =
    node.inputs;

  if (
    inputs === null ||
    typeof inputs !==
      "object" ||
    Array.isArray(inputs)
  ) {
    throw new WorkflowInputError(
      `LoadImage node ${nodeId} has invalid inputs`
    );
  }

  (
    inputs as
      Record<string, unknown>
  ).image = filename;

  return copy;
}
