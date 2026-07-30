export type { AiCompleteRequest, AiCompleteResult, AiProvider, AiTokenUsage } from "./types.js";
export {
  estimateTokenUsage,
  mergeTokenUsage,
} from "./types.js";
export {
  OllamaProvider,
  ollamaJsonFormat,
  type OllamaProviderOptions,
} from "./ollama.js";
export {
  OpenAiProvider,
  openAiResponseFormat,
  unwrapRankItemsPayload,
  type OpenAiProviderOptions,
} from "./openai.js";
export {
  GoogleAiProvider,
  googleResponseSchema,
  type GoogleAiProviderOptions,
} from "./google.js";
export {
  createAiProvider,
  createAiProviderForUser,
  resolveAiProviderKind,
  resolveModelForTier,
  type AiProviderKind,
  type CreateAiProviderOptions,
} from "./factory.js";
export {
  scoreKeywordMatch,
  articleMatchesTopicKeywords,
  withInheritedCatalogKeywords,
  combineFinalRank,
  sanitizeKeyword,
  englishPluralVariants,
  INHERITED_KEYWORD_WEIGHT_FACTOR,
  MAX_KEYWORD_LENGTH,
  MIN_KEYWORD_LENGTH,
  MIN_PLURAL_FOLD_LENGTH,
  type KeywordTopic,
  type KeywordMatchResult,
} from "./keyword.js";
export {
  tokenizeTopicLabel,
  pathKeywordsForTopicName,
  inheritedKeywordsForTopicName,
} from "./topic-keywords.js";
export {
  getTopicTree,
  resolveSelectableTopicLabel,
  findNodeByLabel,
  topicPathLabels,
  TOPIC_TREE_NODES,
  TOPIC_TREE_VERSION,
  type TopicTreeNode,
  type TopicTreeResponse,
} from "./topic-tree.js";
export {
  rankArticleBatch,
  composeFeedReason,
  extractKeywordReason,
  type RankTopicInput,
  type RankArticleInput,
  type RankedItem,
  type RankArticleBatchInput,
  type RankArticleBatchResult,
} from "./rank.js";
export {
  adviseTopics,
  parseAdvisorResponse,
  looksLikeRankPayload,
  buildAdvisorPrompt,
  type AdvisorChatMessage,
  type AdvisorFollowingTopic,
  type AdvisorSuggestion,
  type AdviseTopicsInput,
  type AdviseTopicsResult,
} from "./advisor.js";
