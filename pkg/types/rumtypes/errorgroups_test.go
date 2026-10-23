package rumtypes

import (
	"net/http"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/swaggest/openapi-go/openapi3"
)

func TestGettableErrorGroupOpenAPISchema(t *testing.T) {
	reflector := openapi3.NewReflector()
	operation, err := reflector.NewOperationContext(http.MethodGet, "/errors")
	require.NoError(t, err)
	operation.AddRespStructure(GettableErrorGroup{})
	require.NoError(t, reflector.AddOperation(operation))

	schema, ok := reflector.Spec.Components.Schemas.MapOfSchemaOrRefValues["RumtypesGettableErrorGroup"]
	require.True(t, ok)
	require.NotNil(t, schema.Schema)

	testCases := []struct {
		name     string
		property string
		nullable bool
		ref      string
	}{
		{name: "LinkedRequest_NullableRef", property: "linkedRequest", nullable: true, ref: "#/components/schemas/RumtypesTimelineEvent"},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			property, ok := schema.Schema.Properties[testCase.property]
			require.True(t, ok)
			require.NotNil(t, property.Schema, "property must be an inline schema, not a bare $ref")

			assert.Equal(t, testCase.nullable, property.Schema.Nullable != nil && *property.Schema.Nullable)
			require.Len(t, property.Schema.AllOf, 1)
			require.NotNil(t, property.Schema.AllOf[0].SchemaReference)
			assert.Equal(t, testCase.ref, property.Schema.AllOf[0].SchemaReference.Ref)
			assert.Contains(t, schema.Schema.Required, testCase.property)
		})
	}
}
