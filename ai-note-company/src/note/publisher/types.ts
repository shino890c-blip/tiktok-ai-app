import type { ArticleMode } from "../../config";

/** Everything the publisher needs for one article. */
export interface NotePostInput {
  article_id: string;
  title: string;
  /** Markdown of the free part (H1 removed). */
  free_body: string;
  /** Markdown of the paid part ("" for free articles). */
  paid_body: string;
  tags: string[];
  cover_image: string | null;
  price: number;
  publish_mode: ArticleMode;
}

export interface DraftResult {
  status: "DRAFT";
  edit_url: string;
  note_key: string | null;
  is_mock: boolean;
  warnings: string[];
}

export interface PublishResult {
  status: "PUBLISHED";
  /** Only set when the public URL was actually opened and verified. */
  note_url: string;
  is_mock: boolean;
  warnings: string[];
}

export interface NotePublisher {
  readonly name: string;
  readonly isMock: boolean;
  /** Creates (or updates, when editUrl is given) a note DRAFT. Never publishes. */
  saveDraft(input: NotePostInput, editUrl?: string | null): Promise<DraftResult>;
  /** Publishes an existing draft. Throws unless the public URL was verified. */
  publish(input: NotePostInput, editUrl: string): Promise<PublishResult>;
}

/** Raised after the irreversible "publish" click when the result can't be verified. Never auto-retried. */
export class PublishUnverifiedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PublishUnverifiedError";
  }
}
