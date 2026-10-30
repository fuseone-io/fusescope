CREATE TABLE IF NOT EXISTS `signoz_logs`.`rehydrated_distributed_logs_v2_resource` ON CLUSTER `cluster` AS `signoz_logs`.`rehydrated_logs_v2_resource`
ENGINE = Distributed('cluster', 'signoz_logs', 'rehydrated_logs_v2_resource', cityHash64(labels, fingerprint))
