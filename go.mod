module github.com/fuseone-io/fusescope

go 1.26.10

require (
	dario.cat/mergo v1.0.2
	github.com/AfterShip/clickhouse-sql-parser v0.5.6
	github.com/ClickHouse/clickhouse-go/v2 v2.47.0
	github.com/DATA-DOG/go-sqlmock v1.5.2
	github.com/SigNoz/clickhouse-go-mock v0.14.0
	github.com/SigNoz/govaluate v0.0.0-20240203125216-988004ccc7fd
	github.com/antlr4-go/antlr/v4 v4.13.1
	github.com/antonmedv/expr v1.15.3
	github.com/apache/arrow-go/v18 v18.8.0
	github.com/aws/aws-sdk-go-v2 v1.48.0
	github.com/aws/aws-sdk-go-v2/config v1.33.18
	github.com/aws/aws-sdk-go-v2/credentials v1.21.0
	github.com/aws/aws-sdk-go-v2/service/s3 v1.114.10
	github.com/beevik/etree v1.8.1
	github.com/bytedance/sonic v1.15.5
	github.com/cespare/xxhash/v2 v2.3.0
	github.com/coreos/go-oidc/v3 v3.21.0
	github.com/dgraph-io/ristretto/v2 v2.4.2
	github.com/dustin/go-humanize v1.1.0
	github.com/emersion/go-smtp v0.25.0
	github.com/evanphx/json-patch/v5 v5.9.11
	github.com/fuseone-io/fusescope-collector-server/components/pkg/ingestpolicy v0.1.0
	github.com/fuseone-io/fusescope-collector-server/components/pkg/ingestreport v0.1.0
	github.com/fuseone-io/fusescope-collector-server/components/pkg/logspipeline v0.6.1
	github.com/gin-gonic/gin v1.12.0
	github.com/go-openapi/runtime v0.33.4
	github.com/go-openapi/strfmt v0.27.4
	github.com/go-playground/validator/v10 v10.30.6
	github.com/go-redis/redismock/v9 v9.2.0
	github.com/go-viper/mapstructure/v2 v2.5.0
	github.com/gojek/heimdall/v7 v7.3.1
	github.com/golang-jwt/jwt/v5 v5.3.1
	github.com/google/uuid v1.6.0
	github.com/gorilla/handlers v1.5.2
	github.com/gorilla/mux v1.8.1
	github.com/gorilla/websocket v1.5.4-0.20250319132907-e064f32e3674
	github.com/huandu/go-sqlbuilder v1.39.1
	github.com/jackc/pgx/v5 v5.12.0
	github.com/json-iterator/go v1.1.13-0.20220915233716-71ac16282d12
	github.com/knadh/koanf v1.5.0
	github.com/knadh/koanf/v2 v2.4.1
	github.com/mailru/easyjson v0.9.2
	github.com/open-telemetry/opamp-go v0.25.0
	github.com/open-telemetry/opentelemetry-collector-contrib/pkg/stanza v0.164.1
	github.com/openfga/api/proto v0.0.0-20260319214821-f153694bfc20
	github.com/openfga/language/pkg/go v0.3.2
	github.com/opentracing/opentracing-go v1.2.0
	github.com/perses/spec v0.1.2
	github.com/pkg/errors v0.9.1
	github.com/prometheus/alertmanager v0.31.1
	github.com/prometheus/client_golang v1.25.0
	github.com/prometheus/common v0.73.1
	github.com/prometheus/prometheus v0.311.3
	github.com/redis/go-redis/extra/redisotel/v9 v9.23.0
	github.com/redis/go-redis/v9 v9.23.0
	github.com/rs/cors v1.11.1
	github.com/russellhaering/gosaml2 v0.12.0
	github.com/russellhaering/goxmldsig v1.6.1
	github.com/samber/lo v1.53.0
	github.com/segmentio/analytics-go/v3 v3.4.0
	github.com/sethvargo/go-password v0.4.0
	github.com/smartystreets/goconvey v1.8.1
	github.com/spf13/cobra v1.10.2
	github.com/stretchr/testify v1.12.1
	github.com/swaggest/jsonschema-go v0.3.79
	github.com/swaggest/rest v0.2.76
	github.com/tidwall/gjson v1.20.0
	github.com/uptrace/bun v1.3.0
	github.com/uptrace/bun/dialect/pgdialect v1.3.0
	github.com/uptrace/bun/dialect/sqlitedialect v1.3.0
	github.com/uptrace/bun/extra/bunotel v1.3.0
	github.com/yuin/goldmark v1.8.7
	go.opentelemetry.io/collector/confmap v1.70.0
	go.opentelemetry.io/collector/pdata v1.70.0
	go.opentelemetry.io/contrib/instrumentation/github.com/gorilla/mux/otelmux v0.72.0
	go.opentelemetry.io/contrib/instrumentation/net/http/otelhttp v0.72.0
	go.opentelemetry.io/contrib/otelconf v0.27.0
	go.opentelemetry.io/otel v1.47.0
	go.opentelemetry.io/otel/metric v1.47.0
	go.opentelemetry.io/otel/sdk v1.47.0
	go.opentelemetry.io/otel/trace v1.47.0
	go.uber.org/multierr v1.11.0
	go.uber.org/zap v1.28.0
	golang.org/x/crypto v0.58.0
	golang.org/x/exp v0.0.0-20260908205506-85c1c2202aba
	golang.org/x/mod v0.42.0
	golang.org/x/net v0.62.0
	golang.org/x/oauth2 v0.37.0
	golang.org/x/sync v0.24.0
	golang.org/x/term v0.47.0
	golang.org/x/text v0.43.0
	gonum.org/v1/gonum v0.17.0
	google.golang.org/api v0.310.0
	google.golang.org/protobuf v1.36.12
	gopkg.in/yaml.v2 v2.4.0
	gopkg.in/yaml.v3 v3.0.1
	k8s.io/apimachinery v0.37.2
	modernc.org/sqlite v1.62.0
)

require (
	github.com/IBM/pgxpoolprometheus v1.1.3 // indirect
	github.com/aws/aws-sdk-go-v2/aws/protocol/eventstream v1.7.27 // indirect
	github.com/aws/aws-sdk-go-v2/feature/ec2/imds v1.20.9 // indirect
	github.com/aws/aws-sdk-go-v2/internal/configsources v1.5.12 // indirect
	github.com/aws/aws-sdk-go-v2/internal/endpoints/v2 v2.8.12 // indirect
	github.com/aws/aws-sdk-go-v2/internal/v4a v1.5.12 // indirect
	github.com/aws/aws-sdk-go-v2/service/internal/accept-encoding v1.13.25 // indirect
	github.com/aws/aws-sdk-go-v2/service/internal/checksum v1.11.13 // indirect
	github.com/aws/aws-sdk-go-v2/service/internal/presigned-url v1.14.12 // indirect
	github.com/aws/aws-sdk-go-v2/service/internal/s3shared v1.20.12 // indirect
	github.com/aws/aws-sdk-go-v2/service/signin v1.13.1 // indirect
	github.com/aws/aws-sdk-go-v2/service/sns v1.39.11 // indirect
	github.com/aws/aws-sdk-go-v2/service/sso v1.39.5 // indirect
	github.com/aws/aws-sdk-go-v2/service/ssooidc v1.44.5 // indirect
	github.com/aws/aws-sdk-go-v2/service/sts v1.52.0 // indirect
	github.com/aws/smithy-go v1.28.9 // indirect
	github.com/bytedance/gopkg v0.1.3 // indirect
	github.com/bytedance/sonic/loader v0.5.3 // indirect
	github.com/cloudwego/base64x v0.1.6 // indirect
	github.com/emersion/go-sasl v0.0.0-20241020182733-b788ff22d5a6 // indirect
	github.com/fxamacker/cbor/v2 v2.9.4 // indirect
	github.com/gabriel-vasile/mimetype v1.4.16 // indirect
	github.com/go-openapi/runtime/server-middleware v0.33.4 // indirect
	github.com/go-openapi/swag/cmdutils v0.29.2 // indirect
	github.com/go-openapi/swag/conv v0.29.2 // indirect
	github.com/go-openapi/swag/fileutils v0.29.2 // indirect
	github.com/go-openapi/swag/jsonutils v0.29.2 // indirect
	github.com/go-openapi/swag/loading v0.29.2 // indirect
	github.com/go-openapi/swag/mangling v0.29.2 // indirect
	github.com/go-openapi/swag/netutils v0.29.2 // indirect
	github.com/go-openapi/swag/pools v0.29.2 // indirect
	github.com/go-openapi/swag/stringutils v0.29.2 // indirect
	github.com/go-openapi/swag/typeutils v0.29.2 // indirect
	github.com/go-openapi/swag/yamlutils v0.29.2 // indirect
	github.com/go-playground/locales v0.14.2 // indirect
	github.com/go-playground/universal-translator v0.18.2 // indirect
	github.com/goccy/go-yaml v1.19.2 // indirect
	github.com/google/flatbuffers v25.12.19+incompatible // indirect
	github.com/hashicorp/go-metrics v0.5.4 // indirect
	github.com/hashicorp/go-uuid v1.0.3 // indirect
	github.com/huandu/go-clone v1.7.3 // indirect
	github.com/jackc/pgpassfile v1.0.0 // indirect
	github.com/jackc/pgservicefile v0.0.0-20240606120523-5a60cdf6a761 // indirect
	github.com/jackc/puddle/v2 v2.2.3 // indirect
	github.com/jonboulle/clockwork v0.5.0 // indirect
	github.com/leodido/go-urn v1.5.0 // indirect
	github.com/mattermost/xml-roundtrip-validator v0.1.0 // indirect
	github.com/mattn/go-isatty v0.0.24 // indirect
	github.com/ncruces/go-strftime v1.1.0 // indirect
	github.com/nxadm/tail v1.4.11 // indirect
	github.com/pandatix/go-abnf v0.5.3 // indirect
	github.com/redis/go-redis/extra/rediscmd/v9 v9.23.0 // indirect
	github.com/remyoudompheng/bigfft v0.0.0-20230129092748-24d4a6f8daec // indirect
	github.com/swaggest/refl v1.4.0 // indirect
	github.com/swaggest/usecase v1.3.1 // indirect
	github.com/twitchyliquid64/golang-asm v0.15.1 // indirect
	github.com/ugorji/go/codec v1.3.1 // indirect
	github.com/uptrace/opentelemetry-go-extra/otelsql v0.3.2 // indirect
	github.com/x448/float16 v0.8.4 // indirect
	github.com/zeebo/assert v1.3.1 // indirect
	go.mongodb.org/mongo-driver/v2 v2.5.0 // indirect
	go.opentelemetry.io/collector/config/configauth v1.70.0 // indirect
	go.opentelemetry.io/collector/extension/extensionauth v1.70.0 // indirect
	go.opentelemetry.io/collector/internal/componentalias v0.164.0 // indirect
	go.opentelemetry.io/collector/receiver/xreceiver v0.164.0 // indirect
	go.opentelemetry.io/contrib/propagators/autoprop v0.72.0 // indirect
	go.opentelemetry.io/contrib/propagators/aws v1.47.0 // indirect
	go.opentelemetry.io/contrib/propagators/b3 v1.47.0 // indirect
	go.opentelemetry.io/contrib/propagators/jaeger v1.47.0 // indirect
	go.opentelemetry.io/contrib/propagators/ot v1.47.0 // indirect
	go.opentelemetry.io/otel/exporters/otlp/otlplog/otlploggrpc v0.23.0 // indirect
	go.opentelemetry.io/otel/exporters/otlp/otlplog/otlploghttp v0.23.0 // indirect
	go.opentelemetry.io/otel/exporters/otlp/otlpmetric/otlpmetricgrpc v1.47.0 // indirect
	go.opentelemetry.io/otel/exporters/otlp/otlpmetric/otlpmetrichttp v1.47.0 // indirect
	go.opentelemetry.io/otel/exporters/stdout/stdoutlog v0.23.0 // indirect
	go.opentelemetry.io/otel/exporters/stdout/stdoutmetric v1.47.0 // indirect
	go.opentelemetry.io/otel/exporters/stdout/stdouttrace v1.47.0 // indirect
	go.opentelemetry.io/otel/sdk/log v1.47.0 // indirect
	go.yaml.in/yaml/v2 v2.4.4 // indirect
	golang.org/x/arch v0.22.0 // indirect
	gopkg.in/inf.v0 v0.9.1 // indirect
	k8s.io/kube-openapi v0.0.0-20260821135717-be32def86098 // indirect
	modernc.org/libc v1.80.1 // indirect
	modernc.org/mathutil v1.7.1 // indirect
	modernc.org/memory v1.12.1 // indirect
	sigs.k8s.io/json v0.0.0-20260909141634-11ed52e25bc5 // indirect
	sigs.k8s.io/randfill v1.0.0 // indirect
	sigs.k8s.io/structured-merge-diff/v6 v6.4.2 // indirect
	sigs.k8s.io/yaml v1.6.0 // indirect
)

require (
	cel.dev/expr v0.25.2 // indirect
	cloud.google.com/go/auth v0.24.1-0.20261001053825-dbc26066f70a // indirect
	cloud.google.com/go/auth/oauth2adapt v0.3.0 // indirect
	cloud.google.com/go/compute/metadata v0.10.0 // indirect
	github.com/ClickHouse/ch-go v0.75.0
	github.com/Masterminds/squirrel v1.5.4 // indirect
	github.com/Yiling-J/theine-go v0.6.2 // indirect
	github.com/alecthomas/units v0.0.0-20240927000941-0f3dac36c52b
	github.com/andybalholm/brotli v1.2.6 // indirect
	github.com/armon/go-metrics v0.4.1 // indirect
	github.com/beorn7/perks v1.0.1 // indirect
	github.com/cenkalti/backoff/v4 v4.3.0 // indirect
	github.com/cenkalti/backoff/v5 v5.0.3 // indirect
	github.com/coder/quartz v0.3.0 // indirect
	github.com/coreos/go-systemd/v22 v22.6.0 // indirect
	github.com/davecgh/go-spew v1.1.2-0.20180830191138-d8f796af33cc // indirect
	github.com/dennwc/varint v1.0.0 // indirect
	github.com/docker/go-units v0.5.0 // indirect
	github.com/edsrzf/mmap-go v1.2.0 // indirect
	github.com/elastic/lunes v0.2.2 // indirect
	github.com/emirpasic/gods v1.18.1 // indirect
	github.com/envoyproxy/protoc-gen-validate v1.3.3 // indirect
	github.com/expr-lang/expr v1.17.8
	github.com/facette/natsort v0.0.0-20181210072756-2cd4dd1e2dcb // indirect
	github.com/felixge/httpsnoop v1.1.0 // indirect
	github.com/fsnotify/fsnotify v1.9.0 // indirect
	github.com/go-faster/city v1.0.1 // indirect
	github.com/go-faster/errors v0.8.0 // indirect
	github.com/go-jose/go-jose/v4 v4.1.7
	github.com/go-logr/logr v1.4.4 // indirect
	github.com/go-logr/stdr v1.2.2 // indirect
	github.com/go-openapi/analysis v1.0.1 // indirect
	github.com/go-openapi/errors v0.22.9 // indirect
	github.com/go-openapi/jsonpointer v1.0.2 // indirect
	github.com/go-openapi/jsonreference v1.0.3 // indirect
	github.com/go-openapi/loads v0.25.3 // indirect
	github.com/go-openapi/spec v1.0.1 // indirect
	github.com/go-openapi/swag v0.29.2 // indirect
	github.com/go-openapi/validate v1.0.1 // indirect
	github.com/gobwas/glob v0.2.3 // indirect
	github.com/goccy/go-json v0.10.6 // indirect
	github.com/gogo/protobuf v1.3.2 // indirect
	github.com/golang/protobuf v1.5.4 // indirect
	github.com/google/btree v1.1.3 // indirect
	github.com/google/cel-go v0.31.0 // indirect
	github.com/google/s2a-go v0.1.11 // indirect
	github.com/googleapis/enterprise-certificate-proxy v0.3.24 // indirect
	github.com/googleapis/gax-go/v2 v2.27.0 // indirect
	github.com/gopherjs/gopherjs v1.17.2 // indirect
	github.com/grafana/regexp v0.0.0-20250905093917-f7b3be9d1853 // indirect
	github.com/grpc-ecosystem/go-grpc-middleware v1.4.0 // indirect
	github.com/grpc-ecosystem/go-grpc-middleware/v2 v2.3.3 // indirect
	github.com/grpc-ecosystem/grpc-gateway/v2 v2.31.0 // indirect
	github.com/hashicorp/errwrap v1.1.0 // indirect
	github.com/hashicorp/go-immutable-radix v1.3.1 // indirect
	github.com/hashicorp/go-msgpack/v2 v2.1.5 // indirect
	github.com/hashicorp/go-multierror v1.1.1 // indirect
	github.com/hashicorp/go-sockaddr v1.0.7 // indirect
	github.com/hashicorp/go-version v1.9.0 // indirect
	github.com/hashicorp/golang-lru v1.0.2 // indirect
	github.com/hashicorp/golang-lru/v2 v2.0.7 // indirect
	github.com/hashicorp/memberlist v0.5.4 // indirect
	github.com/huandu/xstrings v1.5.0 // indirect
	github.com/inconshreveable/mousetrap v1.1.0 // indirect
	github.com/jessevdk/go-flags v1.6.1 // indirect
	github.com/jinzhu/inflection v1.0.0 // indirect
	github.com/josharian/intern v1.0.0 // indirect
	github.com/jpillora/backoff v1.0.0 // indirect
	github.com/jtolds/gls v4.20.0+incompatible // indirect
	github.com/klauspost/compress v1.20.3 // indirect
	github.com/klauspost/cpuid/v2 v2.4.0 // indirect
	github.com/lann/builder v0.0.0-20180802200727-47ae307949d0 // indirect
	github.com/lann/ps v0.0.0-20150810152359-62de8c46ede0 // indirect
	github.com/leodido/go-syslog/v4 v4.6.0 // indirect
	github.com/leodido/ragel-machinery v0.0.0-20190525184631-5f46317e436b // indirect
	github.com/magefile/mage v1.15.0 // indirect
	github.com/matttproud/golang_protobuf_extensions v1.0.4 // indirect
	github.com/mdlayher/socket v0.5.1 // indirect
	github.com/mdlayher/vsock v1.2.1 // indirect
	github.com/mfridman/interpolate v0.0.2 // indirect
	github.com/miekg/dns v1.1.72 // indirect
	github.com/mitchellh/copystructure v1.2.0 // indirect
	github.com/mitchellh/mapstructure v1.5.1-0.20231216201459-8508981c8b6c // indirect
	github.com/mitchellh/reflectwalk v1.0.2 // indirect
	github.com/modern-go/concurrent v0.0.0-20180306012644-bacd9c7ef1dd // indirect
	github.com/modern-go/reflect2 v1.0.3-0.20250322232337-35a7c28c31ee // indirect
	github.com/munnerz/goautoneg v0.0.0-20191010083416-a7dc8b61c822 // indirect
	github.com/mwitkow/go-conntrack v0.0.0-20190716064945-2f068394615f // indirect
	github.com/natefinch/wrap v0.2.0 // indirect
	github.com/oklog/run v1.2.0 // indirect
	github.com/oklog/ulid/v2 v2.1.2
	github.com/open-feature/go-sdk v1.20.0
	github.com/open-telemetry/opentelemetry-collector-contrib/internal/coreinternal v0.164.1 // indirect
	github.com/openfga/openfga v1.21.0
	github.com/paulmach/orb v0.13.0 // indirect
	github.com/pelletier/go-toml/v2 v2.2.4 // indirect
	github.com/pierrec/lz4/v4 v4.1.33 // indirect
	github.com/pressly/goose/v3 v3.27.3 // indirect
	github.com/prometheus/client_model v0.6.3 // indirect
	github.com/prometheus/exporter-toolkit v0.15.1 // indirect
	github.com/prometheus/otlptranslator v1.0.0 // indirect
	github.com/prometheus/procfs v0.22.0 // indirect
	github.com/prometheus/sigv4 v0.4.1 // indirect
	github.com/puzpuzpuz/xsync/v3 v3.5.1 // indirect
	github.com/sagikazarmark/locafero v0.9.0 // indirect
	github.com/sean-/seed v0.0.0-20170313163322-e2103e2c3529 // indirect
	github.com/segmentio/asm v1.2.1 // indirect
	github.com/sethvargo/go-retry v0.4.0 // indirect
	github.com/shopspring/decimal v1.5.0 // indirect
	github.com/shurcooL/httpfs v0.0.0-20230704072500-f1e31cf0ba5c // indirect
	github.com/shurcooL/vfsgen v0.0.0-20230704071429-0000e147ea92 // indirect
	github.com/smarty/assertions v1.15.0 // indirect
	github.com/sourcegraph/conc v0.3.0 // indirect
	github.com/spf13/afero v1.15.0 // indirect
	github.com/spf13/cast v1.10.0 // indirect
	github.com/spf13/pflag v1.0.10 // indirect
	github.com/spf13/viper v1.20.1 // indirect
	github.com/stretchr/objx v0.5.3 // indirect
	github.com/subosito/gotenv v1.6.0 // indirect
	github.com/swaggest/openapi-go v0.2.61
	github.com/tidwall/match v1.1.1 // indirect
	github.com/tidwall/pretty v1.2.1 // indirect
	github.com/tmthrgd/go-hex v0.0.0-20190904060850-447a3041c3bc // indirect
	github.com/valyala/fastjson v1.6.10 // indirect
	github.com/vmihailenco/msgpack/v5 v5.4.1 // indirect
	github.com/vmihailenco/tagparser/v2 v2.0.0 // indirect
	github.com/zeebo/xxh3 v1.1.0 // indirect
	go.opentelemetry.io/auto/sdk v1.2.1 // indirect
	go.opentelemetry.io/collector/component v1.70.0
	go.opentelemetry.io/collector/component/componenttest v0.164.0
	go.opentelemetry.io/collector/consumer v1.70.0 // indirect
	go.opentelemetry.io/collector/consumer/consumererror v0.164.0 // indirect
	go.opentelemetry.io/collector/consumer/consumertest v0.164.0 // indirect
	go.opentelemetry.io/collector/consumer/xconsumer v0.164.0 // indirect
	go.opentelemetry.io/collector/extension v1.70.0 // indirect
	go.opentelemetry.io/collector/extension/xextension v0.164.0 // indirect
	go.opentelemetry.io/collector/featuregate v1.70.0 // indirect
	go.opentelemetry.io/collector/pdata/pprofile v0.164.0 // indirect
	go.opentelemetry.io/collector/pipeline v1.70.0 // indirect
	go.opentelemetry.io/collector/pipeline/xpipeline v0.164.0 // indirect
	go.opentelemetry.io/collector/receiver v1.70.0 // indirect
	go.opentelemetry.io/collector/receiver/receiverhelper v0.164.0 // indirect
	go.opentelemetry.io/collector/semconv v0.128.1-0.20250610090210-188191247685
	go.opentelemetry.io/contrib/instrumentation/net/http/httptrace/otelhttptrace v0.67.0 // indirect
	go.opentelemetry.io/otel/exporters/otlp/otlptrace v1.47.0 // indirect
	go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracegrpc v1.47.0 // indirect
	go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracehttp v1.47.0 // indirect
	go.opentelemetry.io/otel/exporters/prometheus v0.69.0
	go.opentelemetry.io/otel/log v1.47.0 // indirect
	go.opentelemetry.io/otel/sdk/metric v1.47.0
	go.opentelemetry.io/proto/otlp v1.11.1 // indirect
	go.uber.org/atomic v1.12.0 // indirect
	go.uber.org/mock v0.6.0 // indirect
	go.yaml.in/yaml/v3 v3.0.5 // indirect
	golang.org/x/sys v0.49.0 // indirect
	golang.org/x/time v0.16.0 // indirect
	golang.org/x/tools v0.52.0 // indirect
	google.golang.org/genproto/googleapis/api v0.0.0-20261012220534-4341edf3f941 // indirect
	google.golang.org/genproto/googleapis/rpc v0.0.0-20261019180522-ce908d29299b
	google.golang.org/grpc v1.84.0
	gopkg.in/telebot.v3 v3.3.8 // indirect
	k8s.io/client-go v0.37.1 // indirect
	k8s.io/klog/v2 v2.140.0 // indirect
	k8s.io/utils v0.0.0-20260707023825-cf1189d6abe3 // indirect
)

replace github.com/expr-lang/expr => github.com/SigNoz/expr v1.17.7-beta
