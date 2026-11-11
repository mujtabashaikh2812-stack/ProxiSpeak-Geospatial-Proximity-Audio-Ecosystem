import React from 'react'

const Select = ({ label, devices, onChange }) => (
  <label className="block text-sm">
    {label}
    <select
      className="mt-1 w-full rounded border p-1"
      onChange={(e) => onChange(e.target.value)}
    >
      {devices.map((d) => (
        <option key={d.deviceId} value={d.deviceId}>
          {d.label || label}
        </option>
      ))}
    </select>
  </label>
)

const Deviceselectormodal = ({ open, onClose, inputs, outputs, onMicChange, onSpeakerChange }) => {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-80 space-y-3 rounded-lg bg-white p-4">
        <h2 className="font-semibold">Audio devices</h2>
        <Select label="Microphone" devices={inputs} onChange={onMicChange} />
        <Select label="Headphones / Speaker" devices={outputs} onChange={onSpeakerChange} />
        <button onClick={onClose} className="w-full rounded bg-black py-1 text-white">
          Done
        </button>
      </div>
    </div>
  )
}

export default Deviceselectormodal