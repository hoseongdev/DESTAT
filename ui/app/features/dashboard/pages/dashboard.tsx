import { supabase } from "~/postgres/supaclient"

// before rendering Dashboard react component
export async function loader() {
    const {data} = await supabase().from("destat-test").select("*");
    console.log(data);
}

export default function Dashboard() {
  return <div>
      Hello destat world
    </div>
}
