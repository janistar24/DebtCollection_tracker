import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { login as apiLogin } from '../api/auth'
import type { User, Taxpayer, Payment, FollowUp } from '../types'
import { CURRENT_YEAR } from '../data/mockData'
import { getUsers } from '../api/users'
import { getTaxpayers } from '../api/taxpayers'
import { getTaxAssessments } from '../api/tax_assessments'


interface AppState {
  currentUser: User | null
  users: User[]
  taxpayers: Taxpayer[]
  selectedYear: number
  login: (username: string, password: string) => Promise<boolean>
  logout: () => void
  setSelectedYear: (y: number) => void
  addTaxpayer: (tp: Taxpayer) => void
  updateTaxpayer: (tp: Taxpayer) => void
  addPayment: (pay: Payment) => void
  addFollowUp: (fu: FollowUp) => void
  addUser: (u: User) => void
  updateUser: (u: User) => void
}

const AppContext = createContext<AppState | null>(null)

export function AppProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<User | null>(null)
  const [users, setUsers] = useState<User[]>([])
  const [taxpayers, setTaxpayers] = useState<Taxpayer[]>([])
  const [selectedYear, setSelectedYear] = useState(CURRENT_YEAR)
  
  useEffect(() => {
  async function loadData() {
    try {
      const usersData = await getUsers() // 1. โหลด users
      const taxpayersData = await getTaxpayers() // 2. โหลดข้อมูลผู้เสียภาษี
      const taxassessmentsData = await getTaxAssessments() // 3. โหลดข้อมูล assessment

      console.log('taxpayersData =', taxpayersData)
      console.log('taxAssessmentsData =', taxassessmentsData)

      // 4. เอา assessment ของแต่ละคน
      //    ไปใส่ใน taxpayer คนนั้น
      const taxpayersWithAssessments = taxpayersData.map((taxpayer) => {

        const taxpayerAssessments = taxassessmentsData
          .filter(
            (tax_assessment) =>
              tax_assessment.taxpayerId === taxpayer.id
          )
          .map(tax_assessment => ({
            yearRecordId: tax_assessment.yearRecordId,
            landAssessmentId: tax_assessment.landAssessmentId,
            signAssessmentId: tax_assessment.signAssessmentId,
            year: tax_assessment.year,
            landAmount: tax_assessment.landAmount,
            signAmount: tax_assessment.signAmount,
            prevLandAmount: tax_assessment.prevLandAmount,
            prevSignAmount: tax_assessment.prevSignAmount,
          }))

        const selectedYearAssessment = taxassessmentsData.find(
          tax_assessment =>
            tax_assessment.taxpayerId === taxpayer.id &&
            tax_assessment.year === selectedYear
        )

        return {
          ...taxpayer,
          assessments: taxpayerAssessments,
          notes: selectedYearAssessment?.note ?? ''
        }
      })

      setUsers(usersData)

      // สำคัญ: ต้องเป็นตัวที่รวม assessment แล้ว
      setTaxpayers(taxpayersWithAssessments)

    } catch (error) {
      console.error(
        'โหลดข้อมูลจาก API ไม่สำเร็จ:',
        error
      )
    }
  }

  loadData()

}, [selectedYear])
  
  const login = async (
    username: string,
    password: string
  ): Promise<boolean> => {
    try {
      const user = await apiLogin(username, password)

      setCurrentUser(user)

      return true
  } catch (error) {
    console.error('เข้าสู่ระบบไม่สำเร็จ:', error)

    return false
  }
}

  const logout = () => setCurrentUser(null)

  const addTaxpayer = (tp: Taxpayer) => setTaxpayers(prev => [...prev, tp])

  const updateTaxpayer = (tp: Taxpayer) =>
    setTaxpayers(prev => prev.map(t => t.id === tp.id ? tp : t))

  const addPayment = (pay: Payment) => {
    setTaxpayers(prev => prev.map(tp => {
      if (tp.id !== pay.taxpayerId) return tp
      return { ...tp, payments: [...tp.payments, pay] }
    }))
  }

  const addFollowUp = (fu: FollowUp) => {
    setTaxpayers(prev => prev.map(tp => {
      if (tp.id !== fu.taxpayerId) return tp
      return { ...tp, followUps: [...tp.followUps, fu] }
    }))
  }

  const addUser = (u: User) => setUsers(prev => [...prev, u])
  const updateUser = (u: User) => setUsers(prev => prev.map(x => x.id === u.id ? u : x))

  return (
    <AppContext.Provider value={{
      currentUser, users, taxpayers, selectedYear,
      login, logout, setSelectedYear,
      addTaxpayer, updateTaxpayer, addPayment, addFollowUp,
      addUser, updateUser
    }}>
      {children}
    </AppContext.Provider>
  )
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used within AppProvider')
  return ctx
}