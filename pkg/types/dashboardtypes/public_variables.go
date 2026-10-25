package dashboardtypes

import qb "github.com/fuseone-io/fusescope/pkg/types/querybuildertypes/querybuildertypesv5"

func (d *DashboardV2) publicVariables() map[string]qb.VariableItem {
	values := make(map[string]qb.VariableItem, len(d.Spec.Variables))
	for _, v := range d.Spec.Variables {
		switch spec := v.Spec.(type) {
		case *TextVariableSpec:
			values[spec.Name] = qb.VariableItem{Type: qb.TextBoxVariableType, Value: spec.Value}
		case *ListVariableSpec:
			kind := qb.CustomVariableType
			switch spec.Plugin.Kind {
			case VariableKindQuery:
				kind = qb.QueryVariableType
			case VariableKindDynamic:
				kind = qb.DynamicVariableType
			}
			var value any = ""
			if spec.DefaultValue != nil {
				value = spec.DefaultValue.SingleValue
				if spec.DefaultValue.SliceValues != nil {
					value = spec.DefaultValue.SliceValues
				}
			}
			values[spec.Name] = qb.VariableItem{Type: kind, Value: value}
		}
	}
	return values
}
