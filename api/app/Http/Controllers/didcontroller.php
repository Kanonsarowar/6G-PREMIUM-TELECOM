use App\Models\Ivr;

public function create()
{
    $customers = Customer::all();
    $trunks = Trunk::all();
    $ivrs = Ivr::all(); // ADD THIS

    return view('admin.dids.create', compact('customers','trunks','ivrs'));
}

public function edit($id)
{
    $did = Did::find($id);
    $customers = Customer::all();
    $trunks = Trunk::all();
    $ivrs = Ivr::all(); // ADD THIS

    return view('admin.dids.edit', compact('did','customers','trunks','ivrs'));
}
