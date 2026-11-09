import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

type FieldProps = {
  id: string;
  label: string;
  description?: string;
  error?: string;
  required?: boolean;
  className?: string;
  children: ReactNode;
};

export function FormField({ id, label, description, error, required, className = "", children }: FieldProps) {
  return <div className={`shared-form-field ${className}`}>
    <label htmlFor={id}>{label}{required && <span aria-hidden="true" className="shared-form-required">*</span>}</label>
    {description && <p id={`${id}-description`} className="shared-form-description">{description}</p>}
    {children}
    {error && <p id={`${id}-error`} className="shared-form-error" role="alert">{error}</p>}
  </div>;
}

type ControlProps = { error?: string; describedBy?: string };

export function FormInput({ error, describedBy, className = "", ...props }: InputHTMLAttributes<HTMLInputElement> & ControlProps) {
  return <input {...props} aria-invalid={Boolean(error) || undefined} aria-describedby={[describedBy, props.id ? `${props.id}-description` : undefined, error && props.id ? `${props.id}-error` : undefined].filter(Boolean).join(" ") || undefined} className={`shared-form-control ${className}`} />;
}

export function FormTextarea({ error, describedBy, className = "", ...props }: TextareaHTMLAttributes<HTMLTextAreaElement> & ControlProps) {
  return <textarea {...props} aria-invalid={Boolean(error) || undefined} aria-describedby={[describedBy, props.id ? `${props.id}-description` : undefined, error && props.id ? `${props.id}-error` : undefined].filter(Boolean).join(" ") || undefined} className={`shared-form-control shared-form-textarea ${className}`} />;
}

export function FormSelect({ error, describedBy, className = "", ...props }: SelectHTMLAttributes<HTMLSelectElement> & ControlProps) {
  return <select {...props} aria-invalid={Boolean(error) || undefined} aria-describedby={[describedBy, props.id ? `${props.id}-description` : undefined, error && props.id ? `${props.id}-error` : undefined].filter(Boolean).join(" ") || undefined} className={`shared-form-control ${className}`} />;
}

export function FormCombobox({ id, options, ...props }: InputHTMLAttributes<HTMLInputElement> & ControlProps & { options: readonly { value: string; label: string }[] }) {
  const listId = `${id}-options`;
  return <><input {...props} id={id} list={listId} aria-invalid={Boolean(props.error) || undefined} aria-describedby={[props.describedBy, `${id}-description`, props.error ? `${id}-error` : undefined].filter(Boolean).join(" ")} className={`shared-form-control ${props.className ?? ""}`} /><datalist id={listId}>{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</datalist></>;
}

export function FormDatePicker(props: Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & ControlProps) {
  return <FormInput {...props} type="date" />;
}

export function FormCheckbox({ id, label, description, ...props }: InputHTMLAttributes<HTMLInputElement> & { id: string; label: string; description?: string }) {
  return <label className="shared-form-checkbox" htmlFor={id}><input {...props} id={id} type="checkbox" aria-describedby={description ? `${id}-description` : undefined} /><span><strong>{label}</strong>{description && <small id={`${id}-description`}>{description}</small>}</span></label>;
}

export function FormRadioGroup({ legend, name, options, value, onChange }: { legend: string; name: string; value: string; options: readonly { value: string; label: string; description?: string }[]; onChange: (value: string) => void }) {
  return <fieldset className="shared-form-radio-group"><legend>{legend}</legend>{options.map((option) => <label key={option.value}><input type="radio" name={name} value={option.value} checked={value === option.value} onChange={() => onChange(option.value)} /><span><strong>{option.label}</strong>{option.description && <small>{option.description}</small>}</span></label>)}</fieldset>;
}

export function FormSection({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return <section className="shared-form-section"><div><h2>{title}</h2>{description && <p>{description}</p>}</div>{children}</section>;
}

export function FormActions({ children }: { children: ReactNode }) {
  return <div className="shared-form-actions">{children}</div>;
}
