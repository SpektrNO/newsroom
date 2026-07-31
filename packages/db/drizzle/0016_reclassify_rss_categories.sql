-- Reclassify community+rss left over from source_type=substack migration.
-- Community hosts (Substack, dev.to) stay community; known digests → newsletter; rest → website.

UPDATE source_subscriptions
SET category = 'newsletter', updated_at = now()
WHERE adapter = 'rss'
  AND category = 'community'
  AND (
    lower(config->>'rssUrl') LIKE '%tldr.tech%'
    OR lower(config->>'rssUrl') LIKE '%bytes.dev%'
    OR lower(config->>'rssUrl') LIKE '%platformer.news%'
    OR lower(config->>'rssUrl') LIKE '%pragmaticengineer%'
    OR lower(config->>'rssUrl') LIKE '%latent.space%'
    OR lower(config->>'rssUrl') LIKE '%notboring%'
    OR lower(config->>'rssUrl') LIKE '%densediscovery%'
    OR lower(config->>'rssUrl') LIKE '%sidebar.io%'
    OR lower(config->>'rssUrl') LIKE '%newsletter.%'
  )
  AND lower(config->>'rssUrl') NOT LIKE '%substack.com%';
--> statement-breakpoint

UPDATE source_subscriptions
SET category = 'website', updated_at = now()
WHERE adapter = 'rss'
  AND category = 'community'
  AND lower(coalesce(config->>'rssUrl', '')) NOT LIKE '%substack.com%'
  AND lower(coalesce(config->>'rssUrl', '')) NOT LIKE '%dev.to%';
--> statement-breakpoint

-- Keep article_sources in sync for linked subscription rows
UPDATE article_sources AS a
SET category = s.category
FROM source_subscriptions AS s
WHERE a.source_subscription_id = s.id
  AND a.category IS DISTINCT FROM s.category;
