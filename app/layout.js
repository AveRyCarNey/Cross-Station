import './globals.css'

export const metadata = {
  title: 'Cross-Station | Control de Gasolina',
  description: 'Control fácil de tanques, ventas y camiones de combustible.',
}

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  )
}
