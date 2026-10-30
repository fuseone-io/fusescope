package implrumapplication

import (
	"context"
	"testing"

	"github.com/fuseone-io/fusescope/pkg/types/rumtypes"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestModuleWebErrorEventComponentStack(t *testing.T) {
	ctx := context.Background()
	module, orgID := newTestModule(t)
	id := createTestApplication(t, module, orgID, "")
	_, err := module.UploadSourceMaps(ctx, orgID, id, "1.8.0", "ci@example.com", newTestParts(nil, "/assets/main.js.map", readFixture(t, "main.js.map")))
	require.NoError(t, err)
	application, err := module.Get(ctx, orgID, id)
	require.NoError(t, err)
	componentStack := "\n    at PriceTag (https://shop.example.com/assets/main.js:1:41)\n    at Cart (https://shop.example.com/assets/main.js:1:131)\n"

	testCases := []struct {
		name           string
		release        string
		componentStack string
		expected       *rumtypes.ComponentStack
	}{
		{name: "NoComponentStack_Nil", release: "1.8.0"},
		{
			name: "MappedRelease_Retraced", release: "1.8.0", componentStack: componentStack,
			expected: &rumtypes.ComponentStack{
				Stack: "at PriceTag (https://shop.example.com/assets/main.js:1:41)\n    at Cart (https://shop.example.com/assets/main.js:1:131)",
				Frames: []rumtypes.StackFrame{
					{Function: "PriceTag", File: "https://shop.example.com/assets/main.js", Line: 1, Column: 41, Original: &rumtypes.OriginalFrame{Function: "PriceTag", File: "src/price.ts", Line: 3, Column: 11, InApp: true, SourceMap: "/assets/main.js.map"}},
					{Function: "Cart", File: "https://shop.example.com/assets/main.js", Line: 1, Column: 131, Original: &rumtypes.OriginalFrame{Function: "Cart", File: "src/index.ts", Line: 8, Column: 21, InApp: true, SourceMap: "/assets/main.js.map"}},
				},
				Symbolicated: true,
			},
		},
		{
			name: "ReleaseWithoutMap_Missing", release: "1.7.0", componentStack: "\n    at Cart (https://shop.example.com/assets/main.js:1:131)",
			expected: &rumtypes.ComponentStack{
				Stack:            "at Cart (https://shop.example.com/assets/main.js:1:131)",
				Frames:           []rumtypes.StackFrame{{Function: "Cart", File: "https://shop.example.com/assets/main.js", Line: 1, Column: 131}},
				MissingSourceMap: &rumtypes.MissingSourceMap{Release: "1.7.0", Kind: rumtypes.ArtifactKindSourceMap},
			},
		},
	}
	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			row := &errorEventRow{id: "e1", errorType: "TypeError", message: "price is undefined", stacktrace: readFixture(t, "stack.txt"), componentStack: testCase.componentStack}
			event, err := module.newErrorEvent(ctx, application, &resourceInfo{release: testCase.release}, row)
			require.NoError(t, err)
			if testCase.expected != nil {
				require.NotNil(t, event.ComponentStack)
				for i := range event.ComponentStack.Frames {
					if original := event.ComponentStack.Frames[i].Original; original != nil {
						original.Context = nil
					}
				}
			}
			assert.Equal(t, testCase.expected, event.ComponentStack)
		})
	}
}
