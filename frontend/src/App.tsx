import { ConfigProvider } from 'antd'
import { RouterProvider } from 'react-router-dom'
import { antdTheme } from './theme/colors'
import { route } from './routes/route'

function App() {
  return (
    <ConfigProvider theme={antdTheme}>
      <RouterProvider router={route} />
    </ConfigProvider>
  )
}

export default App
