CREATE TABLE IF NOT EXISTS `signoz_logs`.`rehydrated_distributed_logs_v2` ON CLUSTER `cluster` AS `signoz_logs`.`rehydrated_logs_v2`
ENGINE = Distributed('cluster', 'signoz_logs', 'rehydrated_logs_v2', cityHash64(id))
