import { Field, Form, Formik } from "formik";
import { type ReactNode, useState } from "react";
import { Alert } from "react-bootstrap";
import { post } from "src/api/backend/base";
import { Button, Loading } from "src/components";
import { useSetSetting, useSetting } from "src/hooks";
import { T } from "src/locale";
import { showObjectSuccess } from "src/notifications";

export default function MiniCA() {
	const { data, isLoading, error } = useSetting("minica");
	const { mutate: setSetting } = useSetSetting();
	const [errorMsg, setErrorMsg] = useState<ReactNode | null>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [isTesting, setIsTesting] = useState(false);
	const [testResult, setTestResult] = useState<{ success: boolean; message?: string } | null>(null);

	if (isLoading) {
		return (
			<div className="card-body">
				<Loading noLogo />
			</div>
		);
	}

	if (error || !data) {
		return (
			<div className="card-body">
				<Alert variant="danger" show>
					{error?.message || "MiniCA setting is unavailable"}
				</Alert>
			</div>
		);
	}

	return (
		<Formik
			enableReinitialize
			initialValues={{
				url: data.meta?.url || "",
				username: data.meta?.username || "",
				caId: data.meta?.caId || "",
				password: "",
			}}
			onSubmit={(values, { setSubmitting }) => {
				if (isSubmitting) return;
				setIsSubmitting(true);
				setErrorMsg(null);
				setSetting(
					{
						id: "minica",
						value: "configured",
						meta: {
							url: values.url.trim(),
							username: values.username.trim(),
							ca_id: values.caId.trim(),
							...(values.password ? { password: values.password } : {}),
						},
					},
					{
						onError: (err: Error) => setErrorMsg(<T id={err.message} />),
						onSuccess: () => showObjectSuccess("setting", "saved"),
						onSettled: () => {
							setIsSubmitting(false);
							setSubmitting(false);
						},
					},
				);
			}}
		>
			{({ isSubmitting: formSubmitting, dirty }) => (
				<Form>
					<div className="card-body">
						<Alert variant="danger" show={!!errorMsg} onClose={() => setErrorMsg(null)} dismissible>
							{errorMsg}
						</Alert>
						{testResult && (
							<Alert
								variant={testResult.success ? "success" : "danger"}
								show
								dismissible
								onClose={() => setTestResult(null)}
							>
								{testResult.success ? (
									<T id="settings.minica.connection-success" />
								) : (
									testResult.message
								)}
							</Alert>
						)}
						<p>
							<T id="settings.minica.description" />
						</p>
						<Field name="url">
							{({ field }: any) => (
								<div className="mb-3">
									<label className="form-label" htmlFor="minica-url">
										<T id="settings.minica.url" />
									</label>
									<input
										{...field}
										id="minica-url"
										type="url"
										className="form-control"
										placeholder="https://minica.example.com/minica"
										required
										autoComplete="url"
									/>
								</div>
							)}
						</Field>
						<Field name="caId">
							{({ field }: any) => (
								<div className="mb-3">
									<label className="form-label" htmlFor="minica-ca-id">
										<T id="settings.minica.ca-id" />
									</label>
									<input
										{...field}
										id="minica-ca-id"
										type="text"
										className="form-control"
										required
										autoComplete="off"
									/>
								</div>
							)}
						</Field>
						<Field name="username">
							{({ field }: any) => (
								<div className="mb-3">
									<label className="form-label" htmlFor="minica-username">
										<T id="settings.minica.username" />
									</label>
									<input
										{...field}
										id="minica-username"
										type="text"
										className="form-control"
										required
										autoComplete="username"
									/>
								</div>
							)}
						</Field>
						<Field name="password">
							{({ field }: any) => (
								<div className="mb-3">
									<label className="form-label" htmlFor="minica-password">
										<T id="settings.minica.password" />
									</label>
									<input
										{...field}
										id="minica-password"
										type="password"
										className="form-control"
										required={!data.meta?.passwordConfigured}
										autoComplete="new-password"
										placeholder={data.meta?.passwordConfigured ? "********" : undefined}
									/>
									<small className="form-text text-muted">
										<T id="settings.minica.password-note" />
									</small>
								</div>
							)}
						</Field>
						<div className="d-flex gap-2">
							<Button
								type="submit"
								actionType="primary"
								className="bg-pink"
								isLoading={isSubmitting || formSubmitting}
								disabled={isSubmitting || formSubmitting || isTesting}
							>
								<T id="save" />
							</Button>
							<Button
								type="button"
								actionType="secondary"
								isLoading={isTesting}
								disabled={
									dirty ||
									isSubmitting ||
									formSubmitting ||
									isTesting ||
									!data.meta?.passwordConfigured
								}
								onClick={async () => {
									setIsTesting(true);
									setTestResult(null);
									try {
										await post({ url: "/settings/minica/test" });
										setTestResult({ success: true });
									} catch (err) {
										setTestResult({
											success: false,
											message:
												err instanceof Error ? err.message : "MiniCA connectivity test failed",
										});
									} finally {
										setIsTesting(false);
									}
								}}
							>
								<T id="settings.minica.test-connectivity" />
							</Button>
						</div>
					</div>
				</Form>
			)}
		</Formik>
	);
}
