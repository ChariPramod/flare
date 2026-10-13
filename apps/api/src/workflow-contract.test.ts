import { expect, it } from 'vitest';
import { CreateWorkflowDto$outboundSchema } from '@novu/api/models/components/createworkflowdto.js';
import { PatchSubscriberPreferencesDto$outboundSchema } from '@novu/api/models/components/patchsubscriberpreferencesdto.js';
import { publicationEngineBody } from '../../../packages/platform/src/publication.js';
import { emptyDependencies } from '../../../packages/platform/src/content.js';
import { workflowSchema } from '../../../packages/shared/src/workflows.js';

it('builds a complete workflow preference request accepted by the pinned SDK', () => {
  const workflow = workflowSchema.parse({
    workflowId: 'contract',
    name: 'Contract',
    critical: true,
    preferences: { sms: false },
    steps: [],
  });
  const body = publicationEngineBody(workflow, emptyDependencies());
  const result = CreateWorkflowDto$outboundSchema.safeParse(body);
  expect(result.success).toBe(true);
  expect(body.preferences.workflow.all).toEqual({ enabled: true, readOnly: true });
  expect(body.preferences.workflow.channels.sms).toEqual({ enabled: false });
  expect(body.preferences.user.channels).toEqual({});
});

it('uses boolean subscriber channel preferences required by the pinned API', () => {
  const body = { workflowId: 'contract', channels: { email: false, sms: true } };
  expect(PatchSubscriberPreferencesDto$outboundSchema.parse(body)).toEqual(body);
  expect(
    PatchSubscriberPreferencesDto$outboundSchema.safeParse({
      channels: { email: { enabled: false } },
    }).success,
  ).toBe(false);
});
