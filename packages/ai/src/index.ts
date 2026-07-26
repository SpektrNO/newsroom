export type { AiCompleteRequest, AiCompleteResult, AiProvider, AiTokenUsage } from "./types.js";
export {
  estimateTokenUsage,
  mergeTokenUsage,
} from "./types.js";
export { OllamaProvider, ollamaJsonFormat, type OllamaProviderOptions } from "./ollama.js";
export {
  scoreKeywordMatch,
  articleMatchesTopicKeywords,
  withInheritedCatalogKeywords,
  combineFinalRank,
  INHERITED_KEYWORD_WEIGHT_FACTOR,
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
