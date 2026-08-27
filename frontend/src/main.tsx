import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { installAuthenticatedFetch } from './api/auth'
import './index.css'

installAuthenticatedFetch()

ReactDOM.createRoot(document.getElementById('root')!).render(

    <App />

)
