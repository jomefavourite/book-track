export type CommunityBookProgressStyle = "pages" | "chapters";
export type CommunityBookReadingMode = "calendar" | "fixed-days";

export type CommunityBookInput = {
  name: string;
  totalPages?: number;
  totalChapters?: number;
  progressStyle?: CommunityBookProgressStyle;
  ignorePages?: boolean;
};

export function isCommunityBookChapterOnly(input: {
  progressStyle?: CommunityBookProgressStyle;
  ignorePages?: boolean;
}) {
  return input.progressStyle === "chapters" && input.ignorePages === true;
}

export function validateCommunityBookInput(input: CommunityBookInput) {
  const name = input.name.trim();
  if (name.length < 1) {
    throw new Error("Book name is required");
  }

  const progressStyle = input.progressStyle ?? "pages";
  const chapterOnly = isCommunityBookChapterOnly({
    progressStyle,
    ignorePages: input.ignorePages,
  });

  if (!chapterOnly) {
    if (
      input.totalPages === undefined ||
      !Number.isFinite(input.totalPages) ||
      input.totalPages < 1
    ) {
      throw new Error("Total pages is required unless pages are ignored");
    }
  }

  if (progressStyle === "chapters") {
    if (
      input.totalChapters === undefined ||
      !Number.isInteger(input.totalChapters) ||
      input.totalChapters < 1
    ) {
      throw new Error("Total chapters is required for chapter-based books");
    }
  }
}

export function canAccessCommunityBooks(options: {
  visibility: "public" | "private";
  isMember: boolean;
}) {
  return options.visibility === "public" || options.isMember;
}
