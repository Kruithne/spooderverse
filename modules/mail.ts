import { parse_template } from 'spooder';

type MailTemplateOptions = {
	base_html?: string;
	base_text?: string;
	html_template?: string;
	text_template?: string;
};

export async function mail_template(options: MailTemplateOptions) {
	let text_template = options.text_template ? await Bun.file(options.text_template).text() : '';
	let html_template = options.html_template ? await Bun.file(options.html_template).text() : '';
	
	if (options.base_text) {
		const base_text = await Bun.file(options.base_text).text();
		text_template = await parse_template(base_text, { content: text_template }, false);
	}

	if (options.base_html) {
		const base_html = await Bun.file(options.base_html).text();
		html_template = await parse_template(base_html, { content: html_template }, false);
	}

	return {
		render: async (params: Parameters<typeof parse_template>[1]) => {

			const text = await parse_template(text_template, params, false);
			let html = await parse_template(html_template, params, false);

			if (html.length === 0)
				html = text;

			return { text, html };
		}
	}
}