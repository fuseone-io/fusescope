import dotnet from './dotnet';
import go from './go';
import java from './java';
import nodejs from './nodejs';
import python from './python';
import type { Guide } from './types';

export const GUIDES: Guide[] = [nodejs, python, java, dotnet, go];

export function guideById(id: string | undefined): Guide | undefined {
	return GUIDES.find((guide) => guide.id === id);
}
