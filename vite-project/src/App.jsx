import React from 'react'
import MicHud from './Audio-section/Components/HUD/Michud'
import SpatialAudioDemo from './Audio-section/Mixer/SpatialAudioDemo'
import AudioSection from './Audio-section/AudioSection'

const App = () => {
  return (
    <div>
      <MicHud/>
      <SpatialAudioDemo/>
     
    </div>
  )
}

export default App