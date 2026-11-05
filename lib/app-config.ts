/**
 * The per-project identity. This and `lib/botchain/abi.ts` are the only two template files each of
 * the fifteen projects is expected to rewrite.
 *
 * It exists so the shell, the wallet metadata, the page titles and the accent colour all come from
 * one place. Fifteen apps that each hand-edit a layout drift apart; fifteen that read one config
 * stay a family.
 */
export const app = {
  /** Product name, as shown to a user. */
  name: "Tontine",
  /** One line, used as the meta description and under the page title. */
  tagline: "The last one still checking in takes the pot.",
  /** Production URL. Used for wallet-connect metadata and Open Graph. */
  url: "https://tontine.botchain-apps.dev",
  /**
   * Accent colour. Written into `--accent` at the document root, so every component that reads
   * `var(--accent)` picks it up without edits.
   */
  accent: "#C7F464",
  /**
   * The single transaction this app exists to make, in the user's words. Shown in the empty state
   * and reused verbatim in the listing submission, so the app and the form cannot disagree.
   */
  theTx: "Do the thing",
} as const;
