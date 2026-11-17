import { Controller } from 'react-hook-form'
import CalendarCard from '@/components/ui/CalendarCard'
import FormField from '@/components/ui/FormField'
import { FORM_LIMITS } from '../../../../shared/form-rules.js'

/**
 * Title, description and schedule fields shared by the election, polling and
 * competition "Event details" step. They live in one place so the three forms
 * give identical live feedback:
 *
 *  - title / description: validated when the field is left, then on every
 *    keystroke, with a character counter near the limit;
 *  - dates: the calendar only emits complete, valid values, so each pick
 *    re-checks that date and, when the other date is already filled, the
 *    other one too (so "end before start" appears or clears as soon as either
 *    date changes). Blur is deliberately not used for dates: focus leaves the
 *    text box the moment the calendar popup opens, which would flag
 *    "required" while the user is still choosing.
 *
 * The parent owns the form (`useForm` with mode "onTouched"); pass its helpers.
 */
export default function EventDetailsFields({
  register,
  control,
  errors,
  trigger,
  getValues,
  values,
  disabled = false,
  titleLabel = 'Title',
  titlePlaceholder,
  descriptionPlaceholder,
  descriptionHint,
  descriptionRows = 4,
  dateRowClassName = '',
}) {
  const dateField = (name, otherName) => ({ field }) => {
    const isStart = name === 'startDate'
    const label = isStart ? 'Start Date and Time' : 'End Date and Time'
    const handleChange = (value) => {
      field.onChange(value)
      // Re-check once the new value is committed to the form.
      Promise.resolve().then(() => {
        trigger(name)
        if (getValues(otherName)) trigger(otherName)
      })
    }
    return (
      <FormField label={label} required error={errors[name]?.message} id={name} className="v-form-field">
        {(props) => (
          <CalendarCard
            id={props.id}
            hasError={Boolean(errors[name])}
            value={field.value ?? ''}
            onChange={handleChange}
            name={field.name}
            {...(isStart ? { max: values.endDate || undefined } : { min: values.startDate || undefined })}
            required
            disabled={disabled}
            twoStep
            confirmDate
            ariaDescribedBy={props['aria-describedby']}
          />
        )}
      </FormField>
    )
  }

  return (
    <>
      <FormField
        label={titleLabel}
        required
        error={errors.title?.message}
        counter={{ value: values.title, max: FORM_LIMITS.eventTitle }}
        id="title"
        className="v-form-field"
      >
        {(props) => <input placeholder={titlePlaceholder} {...props} {...register('title')} />}
      </FormField>

      <FormField
        label="Description"
        error={errors.description?.message}
        hint={descriptionHint}
        counter={{ value: values.description, max: FORM_LIMITS.description }}
        id="description"
        className="v-form-field"
      >
        {(props) => (
          <textarea rows={descriptionRows} placeholder={descriptionPlaceholder} {...props} {...register('description')} />
        )}
      </FormField>

      <div className={`grid gap-4 sm:grid-cols-2 ${dateRowClassName}`}>
        <Controller control={control} name="startDate" render={dateField('startDate', 'endDate')} />
        <Controller control={control} name="endDate" render={dateField('endDate', 'startDate')} />
      </div>
    </>
  )
}
