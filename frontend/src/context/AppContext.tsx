import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'

import { clearAuthSession, getStoredUser, login as apiLogin } from '../api/auth'
import { getAllocatedPayments } from '../api/payments'
import { getFollowUpLogs } from '../api/follow_up_logs'
import { getTaxAssessments } from '../api/tax_assessments'
import { getTaxpayers } from '../api/taxpayers'
import { getUsers } from '../api/users'
import { CURRENT_YEAR } from '../data/taxData'
import type { FollowUp, Payment, TaxAssessment, Taxpayer, User } from '../types'

interface AppState {
  currentUser: User | null
  users: User[]
  taxpayers: Taxpayer[]
  selectedYear: number
  login: (username: string, password: string) => Promise<boolean>
  logout: () => void
  setSelectedYear: (year: number) => void
  addTaxpayer: (taxpayer: Taxpayer) => void
  updateTaxpayer: (taxpayer: Taxpayer) => void
  removeTaxpayer: (taxpayerId: string) => void
  addPayment: (payment: Payment) => void
  addFollowUp: (followUp: FollowUp) => void
  addUser: (user: User) => void
  updateUser: (user: User) => void
  refreshData: () => Promise<void>
}

const AppContext = createContext<AppState | null>(null)

function pushToMap<T>(map: Map<string, T[]>, key: string, value: T) {
  const existing = map.get(key)
  if (existing) existing.push(value)
  else map.set(key, [value])
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<User | null>(() => getStoredUser())
  const [users, setUsers] = useState<User[]>([])
  const [taxpayers, setTaxpayers] = useState<Taxpayer[]>([])
  const [selectedYear, setSelectedYearState] = useState(CURRENT_YEAR)

  const refreshData = useCallback(async () => {
    const [usersData, taxpayersData, assessmentsData, paymentsData, followUpsData] =
      await Promise.all([
        getUsers(),
        getTaxpayers(),
        getTaxAssessments(),
        getAllocatedPayments(),
        getFollowUpLogs(),
      ])

    const assessmentsByTaxpayer = new Map<string, TaxAssessment[]>()
    const paymentsByTaxpayer = new Map<string, Payment[]>()
    const followUpsByTaxpayer = new Map<string, FollowUp[]>()
    const notesByTaxpayer = new Map<string, string>()

    for (const assessment of assessmentsData) {
      pushToMap(assessmentsByTaxpayer, assessment.taxpayerId, {
        yearRecordId: assessment.yearRecordId,
        landAssessmentId: assessment.landAssessmentId ?? '',
        signAssessmentId: assessment.signAssessmentId ?? '',
        year: assessment.year,
        landAmount: assessment.landAmount,
        signAmount: assessment.signAmount,
        prevLandAmount: assessment.prevLandAmount,
          prevSignAmount: assessment.prevSignAmount,
          note: assessment.note ?? '',
      })

      if (assessment.year === selectedYear) {
        notesByTaxpayer.set(assessment.taxpayerId, assessment.note ?? '')
      }
    }

    for (const payment of paymentsData) {
      pushToMap(paymentsByTaxpayer, payment.taxpayerId, payment)
    }
    for (const followUp of followUpsData) {
      pushToMap(followUpsByTaxpayer, followUp.taxpayerId, followUp)
    }

    setUsers(usersData)
    setTaxpayers(
      taxpayersData.map((taxpayer) => ({
        ...taxpayer,
        assessments: assessmentsByTaxpayer.get(taxpayer.id) ?? [],
        payments: paymentsByTaxpayer.get(taxpayer.id) ?? [],
        followUps: followUpsByTaxpayer.get(taxpayer.id) ?? [],
        notes: notesByTaxpayer.get(taxpayer.id) ?? '',
      })),
    )
  }, [])

  const setSelectedYear = (year: number) => {
    setSelectedYearState(year)
    setTaxpayers((current) => current.map((taxpayer) => ({
      ...taxpayer,
      notes: taxpayer.assessments.find((assessment) => assessment.year === year)?.note ?? '',
    })))
  }

  // หน้า Login เรียกเฉพาะ /login; โหลดข้อมูลระบบหลังเข้าสู่ระบบแล้วเท่านั้น
  useEffect(() => {
    if (!currentUser) return
    void refreshData().catch((error) => {
      console.error('โหลดข้อมูลจาก API ไม่สำเร็จ:', error)
    })
  }, [currentUser, refreshData])

  const login = async (username: string, password: string): Promise<boolean> => {
    const user = await apiLogin(username, password)
    setCurrentUser(user)
    return true
  }

  const logout = () => {
    clearAuthSession()
    setCurrentUser(null)
    setUsers([])
    setTaxpayers([])
  }

  const addTaxpayer = (taxpayer: Taxpayer) => {
    setTaxpayers((current) => [...current, taxpayer])
  }

  const updateTaxpayer = (taxpayer: Taxpayer) => {
    setTaxpayers((current) =>
      current.map((item) => (item.id === taxpayer.id ? taxpayer : item)),
    )
  }

  const removeTaxpayer = (taxpayerId: string) => {
    setTaxpayers((current) =>
      current.filter((taxpayer) => taxpayer.id !== taxpayerId),
    )
  }

  const addPayment = (payment: Payment) => {
    setTaxpayers((current) =>
      current.map((taxpayer) =>
        taxpayer.id === payment.taxpayerId
          ? { ...taxpayer, payments: [...taxpayer.payments, payment] }
          : taxpayer,
      ),
    )
  }

  const addFollowUp = (followUp: FollowUp) => {
    setTaxpayers((current) =>
      current.map((taxpayer) =>
        taxpayer.id === followUp.taxpayerId
          ? { ...taxpayer, followUps: [...taxpayer.followUps, followUp] }
          : taxpayer,
      ),
    )
  }

  const addUser = (user: User) => setUsers((current) => [...current, user])

  const updateUser = (user: User) => {
    setUsers((current) =>
      current.map((item) => (item.id === user.id ? user : item)),
    )
  }

  return (
    <AppContext.Provider
      value={{
        currentUser,
        users,
        taxpayers,
        selectedYear,
        login,
        logout,
        setSelectedYear,
        addTaxpayer,
        updateTaxpayer,
        removeTaxpayer,
        addPayment,
        addFollowUp,
        addUser,
        updateUser,
        refreshData,
      }}
    >
      {children}
    </AppContext.Provider>
  )
}

export function useApp() {
  const context = useContext(AppContext)
  if (!context) throw new Error('useApp must be used within AppProvider')
  return context
}
