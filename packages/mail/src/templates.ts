import type { Transaction } from '@flare/db';
import { renderText } from '@flare/shared';
import { MailError, emailSchema } from './validation.js';
import type { EmailInput } from './validation.js';
export async function resolveEmailTemplate(
  tx: Transaction,
  input: EmailInput,
): Promise<EmailInput> {
  if (!input.template) return input;
  const [version] =
    await tx`select v.* from email_templates t join template_versions v on v.template_id=t.id and v.org_id=t.org_id and v.environment_id=t.environment_id and v.version=coalesce(${input.template.version ?? null},t.current_version) where t.id=${input.template.id} and not t.archived`;
  if (!version) throw new MailError(422, 'Template version not found');
  const variables = {
    ...(version.variables as Record<string, unknown>),
    ...input.template.variables,
  };
  try {
    const rendered = emailSchema.parse({
      ...input,
      template: undefined,
      subject: input.subject ?? renderText(String(version.subject), variables),
      html: renderText(String(version.html), variables, true),
      text: version.text_body ? renderText(String(version.text_body), variables) : undefined,
    });
    return { ...rendered, template: { ...input.template, version: Number(version.version) } };
  } catch (e) {
    throw new MailError(422, `Template rendering failed: ${(e as Error).message}`);
  }
}
