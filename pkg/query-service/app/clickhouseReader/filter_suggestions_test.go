package clickhouseReader

import (
	"testing"

	v3 "github.com/fuseone-io/fusescope/pkg/query-service/model/v3"
	"github.com/stretchr/testify/assert"
)

func TestAttribRankerResourceOrder(t *testing.T) {
	want := []string{
		"host", "host.ip", "host.name", "host.id", "k8s.node.uid", "k8s.node.name", "container_name",
		"container.name", "k8s.container.name", "host", "host.ip", "host.name", "host.id", "faas.instance",
		"cloud.resource_id", "cloudwatch.log.stream", "aws.ecs.task.arn", "aws.ecs.task.id", "k8s.pod.uid",
		"k8s.pod.name", "service.instance.id", "ec2.tag.service-group", "k8s.namespace.name", "service.namespace",
		"env", "ec2.tag.env", "ec2.tag.env-short", "deployment.environment", "ec2.tag.service", "faas.name",
		"k8s.cronjob.uid", "k8s.cronjob.name", "k8s.job.uid", "k8s.job.name", "k8s.daemonset.uid",
		"k8s.daemonset.name", "k8s.statefulset.uid", "k8s.statefulset.name", "k8s.deployment.uid",
		"k8s.deployment.name", "cloudwatch.log.group.name", "service.name", "k8s.namespace.name", "env",
		"service.name", "service",
	}
	assert.Equal(t, want, newRankingStrategy().interestingResourceAttrsInAscRank)
}

func TestAttribRankerSort(t *testing.T) {
	keys := []v3.AttributeKey{
		{Key: "http.method", Type: v3.AttributeKeyTypeTag},
		{Key: "host.name", Type: v3.AttributeKeyTypeResource},
		{Key: "custom.resource", Type: v3.AttributeKeyTypeResource},
		{Key: "k8s.deployment.name", Type: v3.AttributeKeyTypeResource},
		{Key: "service.name", Type: v3.AttributeKeyTypeResource},
		{Key: "body", Type: v3.AttributeKeyTypeUnspecified},
		{Key: "container_name", Type: v3.AttributeKeyTypeResource},
	}
	ranker := newRankingStrategy()
	ranker.sort(keys)

	got := make([]string, 0, len(keys))
	for _, key := range keys {
		got = append(got, key.Key)
	}
	assert.Equal(t, []string{"service.name", "k8s.deployment.name", "container_name", "host.name", "custom.resource", "http.method", "body"}, got)
}
